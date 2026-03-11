# price_tracker.py — Scheduled Price Correlation Checks
# Purpose: Track stock prices at T+1h, T+24h, T+3d after a signal
# Uses queryable database rows instead of asyncio.sleep() — survives restarts
# Dependencies: market_data.py, supabase

import logging
import threading
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

CHECK_INTERVAL_SECONDS = 300  # Run check cycle every 5 minutes


class PriceTracker:
    """
    Scheduled price correlation tracker.
    
    Instead of asyncio.sleep(), creates database rows with check timestamps.
    A background thread runs every 5 minutes and queries for due checks.
    This survives server restarts — all state is in the price_correlations table.
    """
    
    def __init__(self, supabase_client, market_data=None):
        self._supabase = supabase_client
        self._market_data = market_data
        self._running = False
        self._thread = None
        self._stop_event = threading.Event()
    
    def get_market_data(self):
        """Lazy-init market data service."""
        if self._market_data is None:
            from market_data import MarketDataService
            self._market_data = MarketDataService()
        return self._market_data
    
    def start(self):
        """Start the background check cycle."""
        if self._running:
            return
        self._running = True
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._check_loop, daemon=True)
        self._thread.start()
        logger.info("[PRICE_TRACKER] Started (interval: %ds)", CHECK_INTERVAL_SECONDS)
    
    def stop(self):
        """Stop the background check cycle."""
        self._running = False
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=10)
        logger.info("[PRICE_TRACKER] Stopped")
    
    def schedule_checks(self, signal_id: str, ticker: str, filed_at: str, price_at_filing: Optional[float] = None):
        """
        Create a price_correlations row with future check timestamps.
        Called immediately after a signal is stored.
        """
        if not ticker or ticker == "UNKNOWN":
            return
        
        try:
            # Parse filed_at to datetime
            if isinstance(filed_at, str):
                # Handle various formats
                try:
                    dt = datetime.fromisoformat(filed_at.replace("Z", "+00:00"))
                except ValueError:
                    dt = datetime.now(timezone.utc)
            else:
                dt = filed_at
            
            # Ensure timezone-aware
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            
            row = {
                "signal_id": signal_id,
                "ticker": ticker,
                "price_at_filing": price_at_filing,
                "check_1h_at": (dt + timedelta(hours=1)).isoformat(),
                "check_24h_at": (dt + timedelta(hours=24)).isoformat(),
                "check_3d_at": (dt + timedelta(days=3)).isoformat(),
            }
            
            self._supabase.table("price_correlations").insert(row).execute()
            logger.info(f"[PRICE_TRACKER] Scheduled checks for {ticker} (signal {signal_id})")
        except Exception as e:
            logger.error(f"[PRICE_TRACKER] Failed to schedule checks: {e}")
    
    def _check_loop(self):
        """Background loop — runs every 5 minutes."""
        while not self._stop_event.is_set():
            try:
                self._run_check_cycle()
            except Exception as e:
                logger.error(f"[PRICE_TRACKER] Check cycle failed (non-fatal): {e}")
            self._stop_event.wait(CHECK_INTERVAL_SECONDS)
    
    def _run_check_cycle(self):
        """Query for due checks and fetch prices."""
        now = datetime.now(timezone.utc).isoformat()
        mds = self.get_market_data()
        
        # Check T+1h
        self._process_due_checks(
            check_column="check_1h_at",
            price_column="price_1h",
            pct_column="pct_change_1h",
            now=now,
            mds=mds,
        )
        
        # Check T+24h
        self._process_due_checks(
            check_column="check_24h_at",
            price_column="price_24h",
            pct_column="pct_change_24h",
            now=now,
            mds=mds,
        )
        
        # Check T+3d
        self._process_due_checks(
            check_column="check_3d_at",
            price_column="price_3d",
            pct_column="pct_change_3d",
            now=now,
            mds=mds,
        )
    
    def _process_due_checks(self, check_column: str, price_column: str, pct_column: str, now: str, mds):
        """Process all due checks for a specific time window."""
        try:
            result = self._supabase.table("price_correlations") \
                .select("id, ticker, price_at_filing") \
                .lt(check_column, now) \
                .is_(price_column, "null") \
                .limit(50) \
                .execute()
            
            rows = result.data or []
            if not rows:
                return
            
            logger.info(f"[PRICE_TRACKER] Processing {len(rows)} due {price_column} checks")
            
            for row in rows:
                ticker = row["ticker"]
                price = mds.get_price(ticker)
                
                if price is None:
                    continue
                
                # Calculate percentage change
                update = {price_column: price}
                price_at_filing = row.get("price_at_filing")
                if price_at_filing and price_at_filing > 0:
                    pct_change = ((price - price_at_filing) / price_at_filing) * 100
                    update[pct_column] = round(pct_change, 2)
                
                try:
                    self._supabase.table("price_correlations") \
                        .update(update) \
                        .eq("id", row["id"]) \
                        .execute()
                    logger.info(
                        f"[PRICE_TRACKER] {ticker} {price_column}: ${price:.2f} "
                        f"(change: {update.get(pct_column, 'N/A')}%)"
                    )
                except Exception as e:
                    logger.error(f"[PRICE_TRACKER] Failed to update {row['id']}: {e}")
        except Exception as e:
            logger.error(f"[PRICE_TRACKER] Query failed for {price_column}: {e}")
    
    def get_status(self) -> dict:
        """Return tracker status."""
        return {
            "running": self._running,
            "check_interval": CHECK_INTERVAL_SECONDS,
        }
