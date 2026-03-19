# edgar_agent.py — EDGAR Filing Polling Agent (Phase 3 - Pipeline Integration)
# Purpose: Poll SEC EDGAR for filings, delegate processing to SignalPipeline,
#          handle promotion queue, config versioning, and price tracking
# Dependencies: httpx, signal_pipeline, price_tracker

import os
import logging
import threading
import time
import json
import re
import asyncio
import hashlib
import pytz
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv
import httpx

try:
    import requests
except ImportError:
    requests = None  # type: ignore[assignment]

try:
    import yfinance as yf
except ImportError:
    yf = None  # type: ignore[assignment]

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)

# EDGAR endpoints
EDGAR_BASE_URL = "https://www.sec.gov"
TINYFISH_BASE_URL = "https://api.tinyfish.io"
EDGAR_USER_AGENT = "AFI-Bot/1.0 (afi@tinyfish.io)"
TELEGRAM_IMPACT_THRESHOLD = int(os.environ.get("TELEGRAM_IMPACT_THRESHOLD", "40"))

# All filing types to monitor
FORMS_TO_MONITOR = [
    "8-K", "10-K", "10-Q", "4", "SC 13D", "S-1", "S-1/A",
    "DEF 14A", "NT 10-K", "NT 10-Q", "8-K/A", "CORRESP",
]


async def check_edgar_connectivity() -> dict:
    """Called at startup and exposed via /api/health — verifies EFTS reachability."""
    try:
        url = (
            "https://efts.sec.gov/LATEST/search-index"
            "?q=%228-K%22&dateRange=custom&startdt=2024-01-01&enddt=2024-01-02"
        )
        async with httpx.AsyncClient(timeout=10.0) as client:
            start = asyncio.get_event_loop().time()
            r = await client.get(url, headers={"User-Agent": EDGAR_USER_AGENT})
            elapsed_ms = (asyncio.get_event_loop().time() - start) * 1000
            return {"reachable": r.status_code == 200, "latency_ms": round(elapsed_ms, 1)}
    except Exception as e:
        return {"reachable": False, "error": str(e)}


def get_poll_interval() -> int:
    """Returns polling interval in seconds based on market hours (Eastern Time)."""
    et = pytz.timezone("America/New_York")
    now = datetime.now(et)
    hour = now.hour
    if 4 <= hour < 9:       # Pre-market: high activity
        return 45
    elif 9 <= hour < 16:    # Market hours
        return 90
    elif 16 <= hour < 20:   # After-hours earnings
        return 60
    else:                   # Overnight
        return 300


class EdgarAgent:
    """Polls SEC EDGAR for new filings (8-K, 10-K, 10-Q, Form 4, SC 13D) and delegates to SignalPipeline."""

    def __init__(self, supabase_client):
        self.supabase = supabase_client
        self.running = False
        self._thread = None
        self._stop_event = threading.Event()
        self.last_poll_time = None
        self.filings_processed_today = 0
        self._today_date = None
        self._poll_start_time = None

        # Config from env
        self.tinyfish_api_key = os.environ.get("TINYFISH_API_KEY", "")
        self.use_tinyfish = os.environ.get("USE_TINYFISH", "true").lower() == "true"
        self.telegram_enabled = os.environ.get("TELEGRAM_ENABLED", "false").lower() == "true"
        self.poll_interval = get_poll_interval()  # dynamic, recalculated each cycle
        self.edgar_connectivity: dict = {"reachable": None}  # populated at startup

        # Pipeline integration
        self._pipeline = None
        self._price_tracker = None
        self._config_version = 1
        self._tier1_tickers = []
        self._watchlist_tickers = []

    def _init_pipeline(self):
        """Lazy-init the signal pipeline and price tracker."""
        if self._pipeline is None:
            try:
                from signal_pipeline import SignalPipeline
                self._pipeline = SignalPipeline(self.supabase)
                logger.info("[AGENT] Signal pipeline initialized")
            except Exception as e:
                logger.error(f"[AGENT] Failed to init pipeline: {e}")

        if self._price_tracker is None:
            try:
                from price_tracker import PriceTracker
                self._price_tracker = PriceTracker(
                    self.supabase,
                    market_data=self._pipeline.get_market_data() if self._pipeline else None,
                )
                self._price_tracker.start()
                logger.info("[AGENT] Price tracker initialized and started")
            except Exception as e:
                logger.error(f"[AGENT] Failed to init price tracker: {e}")

    def _parse_atom_feed(self, xml_text: str, form_type: str) -> list:
        """Parse SEC EDGAR Atom feed. Handles namespace correctly with regex fallback."""
        import xml.etree.ElementTree as ET

        filings = []

        if not xml_text or len(xml_text) < 200:
            return []

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # Method 1: ElementTree with Atom namespace
        try:
            root = ET.fromstring(xml_text)
            ATOM = 'http://www.w3.org/2005/Atom'
            entries = root.findall(f'{{{ATOM}}}entry')
            if not entries:
                entries = root.findall('.//{http://www.w3.org/2005/Atom}entry')
            if not entries:
                entries = root.findall('.//entry')

            for entry in entries:
                def find_text(tag):
                    el = entry.find(f'{{{ATOM}}}{tag}')
                    if el is None:
                        el = entry.find(tag)
                    return (el.text or '').strip() if el is not None else ''

                title = find_text('title')
                updated = find_text('updated')

                link = ''
                for child in entry:
                    if child.tag.endswith('link'):
                        link = child.get('href', '')
                        break

                acc_m = re.search(r'accession-number=(\d{10}-\d{2}-\d{6})', link + title)
                if not acc_m:
                    # also try the id element
                    id_el = entry.find(f'{{{ATOM}}}id') or entry.find('id')
                    id_text = (id_el.text or '') if id_el is not None else ''
                    acc_m = re.search(r'accession-number=(\d{10}-\d{2}-\d{6})', id_text)
                cik_m = re.search(r'/data/(\d+)/', link)
                comp_m = re.match(r'^.+?\s+-\s+(.*?)\s*\(\d+\)', title)
                company = comp_m.group(1).strip() if comp_m else re.sub(r'\s*\(.*', '', title).strip()

                if acc_m:
                    filings.append({
                        'accession_no': acc_m.group(1),
                        'entity_name': company or 'Unknown',
                        'entity_id': cik_m.group(1) if cik_m else '',
                        'file_date': (updated or today)[:10],
                        'form_type': form_type,
                    })

            if filings:
                return filings
        except ET.ParseError:
            pass

        # Method 2: Regex fallback — handles malformed XML and entries with attributes
        blocks = re.findall(r'<entry[^>]*>(.*?)</entry>', xml_text, re.DOTALL)
        for block in blocks:
            try:
                acc_m = re.search(r'accession-number=(\d{10}-\d{2}-\d{6})', block)
                if not acc_m:
                    continue
                link_m = re.search(r'href="([^"]+)"', block)
                link = link_m.group(1) if link_m else ''
                title_m = re.search(r'<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>', block, re.DOTALL)
                title = (title_m.group(1) or '').strip() if title_m else ''
                date_m = re.search(r'<updated>(.*?)</updated>', block)
                cik_m = re.search(r'/data/(\d+)/', link)
                comp_m = re.match(r'^.+?\s+-\s+(.*?)\s*\(\d+\)', title)
                company = comp_m.group(1).strip() if comp_m else re.sub(r'\s*\(.*', '', title).strip()
                filings.append({
                    'accession_no': acc_m.group(1),
                    'entity_name': company or 'Unknown',
                    'entity_id': cik_m.group(1) if cik_m else '',
                    'file_date': (date_m.group(1) if date_m else today)[:10],
                    'form_type': form_type,
                })
            except Exception:
                continue

        return filings

    def _load_config(self):
        """Load agent config and process promotion queue at cycle start."""
        try:
            result = self.supabase.table("agent_config").select("*").limit(1).execute()
            if result.data:
                config = result.data[0]
                self._config_version = config.get("config_version", 1)
                self._tier1_tickers = config.get("tier1_tickers", [])
                
                if self._pipeline:
                    self._pipeline.set_config_version(self._config_version)

                # Process promotion queue
                pending = config.get("pending_promotions", [])
                if pending:
                    for ticker in pending:
                        if ticker not in self._tier1_tickers:
                            self._tier1_tickers.append(ticker)
                            logger.info(f"[AGENT] Promoted {ticker} to Tier 1")
                    
                    # Clear the promotion queue
                    self.supabase.table("agent_config").update({
                        "pending_promotions": [],
                        "tier1_tickers": self._tier1_tickers,
                    }).eq("id", config["id"]).execute()
                    logger.info(f"[AGENT] Promotion queue cleared, Tier 1 now: {self._tier1_tickers}")
        except Exception as e:
            logger.warning(f"[AGENT] Config load failed (using defaults): {e}")

    def _load_watchlist_tickers(self):
        """Load all unique watchlist tickers for enrichment."""
        try:
            result = self.supabase.table("watchlist").select("ticker").execute()
            self._watchlist_tickers = list(set(
                row["ticker"] for row in (result.data or [])
            ))
        except Exception as e:
            logger.warning(f"[AGENT] Watchlist load failed: {e}")
            self._watchlist_tickers = []

    def _get_market_context(self) -> str:
        """Return market context string for logging only — never used to skip polling."""
        try:
            et = pytz.timezone("America/New_York")
            now = datetime.now(et)
            hour = now.hour
            minute = now.minute
            weekday = now.weekday()
            ts = now.strftime("%H:%M ET")
            if weekday >= 5:
                return f"WEEKEND ({ts}) - companies still file"
            elif 4 <= hour < 9:
                return f"PRE-MARKET ({ts}) - high filing volume"
            elif (hour == 9 and minute >= 30) or (10 <= hour < 16):
                return f"MARKET HOURS ({ts})"
            elif 16 <= hour < 21:
                return f"AFTER-HOURS ({ts}) - earnings releases"
            else:
                return f"OVERNIGHT ({ts})"
        except Exception:
            return "UNKNOWN"

    def get_status(self):
        """Return current agent status."""
        thread_alive = self._thread is not None and self._thread.is_alive()
        next_poll = None
        if thread_alive and self._poll_start_time:
            elapsed = (datetime.now(timezone.utc) - self._poll_start_time).total_seconds()
            remaining = max(0, self.poll_interval - elapsed)
            next_poll = int(remaining)

        status = {
            "agent_status": "running" if thread_alive else "stopped",
            "last_poll_time": self.last_poll_time.isoformat() if self.last_poll_time else None,
            "filings_processed_today": self.filings_processed_today,
            "next_poll_seconds": next_poll,
            "poll_interval": self.poll_interval,
            "config_version": self._config_version,
            "tier1_count": len(self._tier1_tickers),
            "edgar_connectivity": self.edgar_connectivity,
        }

        if self._price_tracker:
            status["price_tracker"] = self._price_tracker.get_status()

        return status

    def start(self):
        """Start the polling loop in a background thread."""
        if self.running:
            logger.info("EDGAR agent is already running")
            return
        self.running = True
        self._stop_event.clear()
        self._init_pipeline()

        # Run connectivity check synchronously before first poll
        try:
            self.edgar_connectivity = asyncio.run(check_edgar_connectivity())
            if self.edgar_connectivity.get("reachable"):
                logger.info(
                    f"[AGENT] EDGAR connectivity OK "
                    f"(latency={self.edgar_connectivity.get('latency_ms')}ms)"
                )
            else:
                logger.critical(
                    f"[AGENT] EDGAR unreachable at startup — will retry every 60s. "
                    f"Error: {self.edgar_connectivity.get('error', 'unknown')}"
                )
        except Exception as e:
            logger.critical(f"[AGENT] Startup connectivity check failed: {e}")
            self.edgar_connectivity = {"reachable": False, "error": str(e)}

        self._thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._thread.start()
        logger.info("EDGAR polling agent started (interval: %ds)", self.poll_interval)

    def stop(self):
        """Stop the polling loop."""
        self.running = False
        self._stop_event.set()
        if self._price_tracker:
            self._price_tracker.stop()
        if self._thread:
            self._thread.join(timeout=10)
        logger.info("EDGAR polling agent stopped")

    def fetch_company_latest(self, ticker: str):
        """Manually fetch and process the latest 8-K for a specific ticker/CIK."""
        try:
            url = f"https://www.sec.gov/cgi-bin/browse-edgar"
            with httpx.Client(timeout=30, headers={"User-Agent": EDGAR_USER_AGENT}, follow_redirects=True) as client:
                response = client.get(
                    url,
                    params={
                        "action": "getcompany",
                        "CIK": ticker,
                        "type": "8-K",
                        "dateb": "",
                        "owner": "include",
                        "count": "5",
                        "output": "atom",
                    }
                )
                if response.status_code == 200:
                    entries = re.findall(r'<accession-number>(.*?)</accession-number>', response.text)
                    company_names = re.findall(r'<company-name>(.*?)</company-name>', response.text)
                    ciks = re.findall(r'<cik>(.*?)</cik>', response.text)
                    if entries:
                        filing_data = {
                            "accession_no": entries[0],
                            "entity_name": company_names[0] if company_names else "Unknown",
                            "entity_id": ciks[0] if ciks else "",
                            "file_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                        }
                        # Ensure pipeline is initialized so we can process
                        self._init_pipeline()
                        self._process_filing(filing_data)
                        return {"status": "success", "message": f"Fetched latest 8-K for {ticker}"}
                    return {"status": "not_found", "message": f"No recent 8-K found for {ticker}"}
                return {"status": "error", "message": f"SEC EDGAR returned HTTP {response.status_code}"}
        except Exception as e:
            logger.error(f"[MANUAL] Error fetching {ticker}: {e}")
            return {"status": "error", "message": str(e)}

    def _poll_loop(self):
        """Main EDGAR polling loop — runs in a background thread, never exits on error."""
        logger.info("EDGAR polling thread started")
        while not self._stop_event.is_set():
            self._poll_start_time = datetime.now(timezone.utc)
            # Recalculate dynamic poll interval at each cycle start
            self.poll_interval = get_poll_interval()
            try:
                # Load config and process promotions at START of each cycle
                self._load_config()
                self._load_watchlist_tickers()

                # Re-check connectivity if previously unreachable
                if not self.edgar_connectivity.get("reachable"):
                    try:
                        self.edgar_connectivity = asyncio.run(check_edgar_connectivity())
                        if not self.edgar_connectivity.get("reachable"):
                            logger.critical(
                                f"[AGENT] EDGAR unreachable — skipping poll cycle. "
                                f"Error: {self.edgar_connectivity.get('error', 'unknown')}. "
                                f"Retrying in 60s."
                            )
                            self._stop_event.wait(60)
                            continue
                        else:
                            logger.info(
                                f"[AGENT] EDGAR connectivity restored "
                                f"(latency={self.edgar_connectivity.get('latency_ms')}ms)"
                            )
                    except Exception as conn_err:
                        logger.critical(f"[AGENT] Connectivity check failed: {conn_err}")
                        self._stop_event.wait(60)
                        continue

                try:
                    from signal_pipeline import pipeline_log
                    pipeline_log("AGENT", f"Poll cycle started (interval={self.poll_interval}s)")
                except Exception:
                    pass

                logger.info("--- EDGAR POLL CYCLE START ---")
                self._poll_edgar()
                logger.info("--- EDGAR POLL CYCLE COMPLETE ---")
            except Exception as e:
                logger.error(
                    f"EDGAR poll cycle failed: {type(e).__name__}: {e}",
                    exc_info=True,
                )
                # Don't crash — wait 30s and retry
                self._stop_event.wait(30)
                continue

            # Sleep in small chunks so stop() can interrupt cleanly
            interval = self.poll_interval
            elapsed = 0
            while elapsed < interval and not self._stop_event.is_set():
                self._stop_event.wait(1)
                elapsed += 1

        logger.info("EDGAR polling thread stopped")

    def _poll_edgar(self):
        """Query EDGAR for new filings across all monitored form types.

        Strategy (in priority order):
        1. EFTS no-q search — omit q param entirely (q=* returns 0 results as of 2026)
        2. Atom feed per-form — SEC browse-edgar getcurrent, reliable fallback
        """
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        three_days_ago = (datetime.now(timezone.utc) - timedelta(days=3)).strftime("%Y-%m-%d")

        # Market context for logging (never used to skip polling)
        market_ctx = self._get_market_context()
        logger.info(f"[POLL] Market context: {market_ctx}")

        # Reset daily counter
        if self._today_date != today:
            self._today_date = today
            self.filings_processed_today = 0

        forms_str = ",".join(FORMS_TO_MONITOR)
        logger.info(f"[POLL] Querying EDGAR for [{forms_str}] filings from {three_days_ago} to {today}")

        filings = []

        # Approach 1: EFTS search — no q param (q=* is broken, returns 0 hits)
        try:
            logger.info("[POLL] Trying EFTS no-q search...")
            with httpx.Client(timeout=30, headers={"User-Agent": EDGAR_USER_AGENT}) as client:
                response = client.get(
                    "https://efts.sec.gov/LATEST/search-index",
                    params={
                        "forms": forms_str,
                        "dateRange": "custom",
                        "startdt": three_days_ago,
                        "enddt": today,
                    },
                )
                if response.status_code == 200:
                    data = response.json()
                    hits = data.get("hits", {}).get("hits", [])
                    total = data.get("hits", {}).get("total", {}).get("value", 0)
                    if hits:
                        filings = hits
                        logger.info(f"[POLL] EFTS returned {len(hits)} hits (total={total})")
                    else:
                        logger.info(f"[POLL] EFTS returned 0 hits (total={total}) — trying Atom feed")
                else:
                    logger.warning(f"[POLL] EFTS returned HTTP {response.status_code}")
        except Exception as e:
            logger.warning(f"[POLL] EFTS search failed: {e}")

        # Approach 2: Atom feed per form type — always tried if EFTS yields nothing
        # Also used as supplementary source when EFTS returns fewer than expected
        if not filings:
            logger.info("[POLL] Trying Atom feed per form type...")
            for form_type in FORMS_TO_MONITOR:
                try:
                    with httpx.Client(timeout=15, headers={"User-Agent": EDGAR_USER_AGENT}) as client:
                        response = client.get(
                            "https://www.sec.gov/cgi-bin/browse-edgar",
                            params={
                                "action": "getcurrent",
                                "type": form_type,
                                "dateb": "",
                                "owner": "include",
                                "count": "40",
                                "search_text": "",
                                "output": "atom",
                            },
                        )
                        if response.status_code == 200:
                            count_before = len(filings)
                            parsed = self._parse_atom_feed(response.text, form_type)
                            filings.extend(parsed[:40])
                            added = len(filings) - count_before
                            if added:
                                logger.info(f"[POLL] Atom feed {form_type}: +{added} filings")
                        else:
                            logger.warning(f"[POLL] Atom feed {form_type}: HTTP {response.status_code}")
                        time.sleep(0.2)  # respect SEC rate limit
                except Exception as e:
                    logger.warning(f"[POLL] Atom feed {form_type} failed: {e}")

        self.last_poll_time = datetime.now(timezone.utc)

        if not filings:
            logger.info("[POLL] No filings found across all search methods.")
            return

        try:
            from signal_pipeline import pipeline_log
            pipeline_log("EDGAR", f"Found {len(filings)} new filings")
        except Exception:
            pass

        logger.info(f"[POLL] Processing {min(len(filings), 50)} of {len(filings)} filings...")

        for filing_data in filings[:50]:
            try:
                self._process_filing(filing_data)
            except Exception as e:
                logger.error(f"[PROCESS] Error processing individual filing (continuing): {e}")

    def _process_filing(self, filing_data):
        """Process a single EDGAR filing through the pipeline."""
        # Extract accession number from various response formats
        source = filing_data.get("_source", filing_data)
        accession_number = (
            source.get("accession_no", "")
            or source.get("accession_number", "")
            or source.get("adsh", "")
        )

        if not accession_number:
            logger.warning("[PROCESS] Filing missing accession number, skipping")
            return

        logger.info(f"[PROCESS] Checking accession: {accession_number}")

        # Check if already processed — only skip if previous attempt SUCCEEDED (conf > 0)
        try:
            result = self.supabase.table("signals").select("id,confidence").eq(
                "accession_number", accession_number
            ).execute()
            if result.data:
                prev_conf = result.data[0].get("confidence", 0)
                if prev_conf > 0:
                    logger.info(f"[PROCESS] Already classified {accession_number} (conf:{prev_conf}), skipping")
                    return
                else:
                    # Previous attempt failed — delete and retry
                    self.supabase.table("signals").delete().eq(
                        "accession_number", accession_number
                    ).execute()
                    logger.info(f"[PROCESS] Retrying failed signal {accession_number} (was conf:0)")
        except Exception as e:
            logger.warning(f"[PROCESS] Dedup check failed (continuing): {e}")

        # Extract filing metadata
        try:
            entity_name_raw = source.get("display_names", source.get("entity_name", "Unknown"))
            if isinstance(entity_name_raw, list):
                company_name = entity_name_raw[0] if entity_name_raw else "Unknown"
            else:
                company_name = str(entity_name_raw) if entity_name_raw else "Unknown"
        except Exception:
            company_name = "Unknown"

        filed_at = source.get("file_date", source.get("filing_date", datetime.now(timezone.utc).isoformat()))

        # Resolve ticker from CIK
        entity_id = str(source.get("entity_id", source.get("cik", ""))).strip()
        if not entity_id:
            parts = accession_number.split("-")
            entity_id = parts[0].lstrip("0") if parts else ""

        resolved_ticker = None
        if entity_id:
            resolved_ticker, resolved_name = self._resolve_ticker_from_cik(entity_id)
            if resolved_ticker and not resolved_ticker.startswith("UNKNOWN"):
                if not company_name or company_name == "Unknown":
                    company_name = resolved_name

        # Build filing URL
        accession_clean = accession_number.replace("-", "")
        
        # Build URL — handle missing entity_id gracefully
        if entity_id:
            filing_url = f"{EDGAR_BASE_URL}/Archives/edgar/data/{entity_id}/{accession_clean}/{accession_number}-index.htm"
        else:
            # Fallback: use accession-based URL without CIK
            filing_url = f"{EDGAR_BASE_URL}/cgi-bin/browse-edgar?action=getcompany&filenum=&State=0&SIC=&dateb=&owner=include&count=10&search_text=&action=getcompany&company=&CIK={accession_number}&type=8-K&output=atom"

        # Resolve form type early so _extract_filing_text can pick the right strategy
        filing_type = source.get("form_type", source.get("filing_type", "8-K"))
        filing_type_map = {
            "8-K": "8-K", "10-K": "10-K", "10-Q": "10-Q", "4": "4",
            "SC 13D": "SC 13D", "SC 13D/A": "SC 13D", "S-1": "S-1", "S-1/A": "S-1",
        }
        filing_type = filing_type_map.get(filing_type, filing_type)

        logger.info(f"[EXTRACT] Extracting text from: {filing_url}")

        # Extract filing text — pass form_type and cik so strategy dispatch can skip TinyFish on 10-K
        filing_text = None
        try:
            filing_text = self._extract_filing_text(
                filing_url, accession_number, entity_id, form_type=filing_type
            )
        except Exception as e:
            logger.error(f"[EXTRACT] Text extraction failed (continuing): {e}")

        if not filing_text:
            logger.warning(f"[EXTRACT] No text extracted for {accession_number}, using fallback")
            filing_text = f"{filing_type} filing by {company_name}. Accession: {accession_number}."

        # --- CONTENT HASH DEDUPLICATION ---
        if filing_text and len(filing_text) > 100:
            content_hash = hashlib.sha256(
                filing_text[:5000].encode("utf-8", errors="replace")
            ).hexdigest()
            try:
                existing = self.supabase.table("signals").select("id").eq(
                    "content_hash", content_hash
                ).execute()
                if existing.data:
                    logger.info(
                        f"[PROCESS] Skipping duplicate filing {accession_number} "
                        f"(content_hash match)"
                    )
                    return
            except Exception as e:
                logger.warning(f"[PROCESS] Content hash check failed (continuing): {e}")
        else:
            content_hash = None

        # --- PIPELINE INTEGRATION ---
        if self._pipeline:
            from signal_pipeline import RawFiling, pipeline_log

            # filing_type was resolved above before extraction
            
            pipeline_log("PIPELINE", f"Processing {resolved_ticker or 'UNKNOWN'} {filing_type}")
            pipeline_log("TINYFISH", "Extracting SEC document...")
            
            raw_filing = RawFiling(
                accession_number=accession_number,
                filing_type=filing_type,
                company_name=company_name,
                entity_id=str(entity_id),
                filed_at=filed_at,
                filing_url=filing_url,
                filing_text=filing_text,
            )
            
            signal = self._pipeline.process(raw_filing, watchlist_tickers=self._watchlist_tickers)
            
            if signal:
                # Override ticker if CIK resolution found a real one
                if resolved_ticker and not resolved_ticker.startswith("UNKNOWN") and signal.ticker == "UNKNOWN":
                    signal.ticker = resolved_ticker
                
                # Store enriched signal
                signal_row = self._pipeline.signal_to_db_row(signal)
                if content_hash:
                    signal_row["content_hash"] = content_hash
                try:
                    result = self.supabase.table("signals").insert(signal_row).execute()
                    self.filings_processed_today += 1
                    logger.info(
                        f"[STORE] Signal stored: {signal.ticker} | {signal.signal} | "
                        f"conf={signal.confidence} | event={signal.event_type} | "
                        f"impact={signal.impact_score}"
                    )

                    # v3: Fire enrichment agents in background
                    stored_id = result.data[0].get("id") if result.data else None
                    if stored_id:
                        import asyncio
                        import threading
                        def _run_enrichment(sid, t, acc, cid, cn):
                            try:
                                asyncio.run(self._enrich_signal_async(sid, t, acc, cid, cn))
                            except Exception as e:
                                logger.warning(f"[ENRICHMENT] Thread failed: {e}")
                        enrich_thread = threading.Thread(
                            target=_run_enrichment,
                            args=(stored_id, signal.ticker, accession_number, str(entity_id), company_name),
                            daemon=True,
                        )
                        enrich_thread.start()
                    
                    # Schedule price tracking
                    if self._price_tracker and result.data:
                        if stored_id:
                            self._price_tracker.schedule_checks(
                                signal_id=stored_id,
                                ticker=signal.ticker,
                                filed_at=signal.filed_at,
                                price_at_filing=signal.price_at_filing,
                            )
                except Exception as e:
                    logger.error(f"[STORE] Failed to store signal (continuing): {e}")
                    return
                
                # Send Telegram alert — uses smart threshold logic (watchlist, confidence, impact)
                if signal.signal != "Pending" and self.telegram_enabled:
                    try:
                        from telegram_bot import should_send_telegram, send_signal_alert
                        alert_data = signal_row.copy()
                        if signal.impact_score is not None:
                            alert_data["impact_score"] = signal.impact_score
                        if signal.event_type is not None:
                            alert_data["event_type"] = signal.event_type

                        # Load global watchlist for alert decisions
                        watched_tickers = []
                        try:
                            wl_result = self.supabase.table("watchlist").select("ticker").execute()
                            watched_tickers = list(set(w["ticker"] for w in (wl_result.data or [])))
                        except Exception:
                            pass

                        if should_send_telegram(alert_data, watched_tickers):
                            is_watched = signal.ticker in watched_tickers
                            send_signal_alert(alert_data, is_watched=is_watched)
                            logger.info(f"[TELEGRAM] Alert sent for {signal.ticker} (impact={signal.impact_score}, watched={is_watched})")
                        else:
                            logger.info(f"[TELEGRAM] Skipped {signal.ticker} — did not meet smart threshold")
                    except Exception as e:
                        logger.error(f"[TELEGRAM] Alert failed (non-fatal): {e}")
        else:
            # Fallback: direct classification (legacy path)
            self._process_filing_legacy(filing_data, filing_text, company_name, accession_number, filed_at)

    def _process_filing_legacy(self, filing_data, filing_text, company_name, accession_number, filed_at):
        """Legacy processing path — used if pipeline fails to initialize."""
        classification = self._classify_filing(filing_text)
        if not classification:
            classification = {
                "ticker": "UNKNOWN",
                "company": company_name,
                "summary": f"8-K filing by {company_name}",
                "signal": "Pending",
                "confidence": 0,
            }

        signal_data = {
            "ticker": classification.get("ticker", "UNKNOWN"),
            "company": classification.get("company", company_name),
            "filing_type": "8-K",
            "signal": classification.get("signal", "Pending"),
            "confidence": classification.get("confidence", 0),
            "summary": classification.get("summary", f"8-K filing by {company_name}"),
            "accession_number": accession_number,
            "filed_at": filed_at,
        }

        try:
            self.supabase.table("signals").insert(signal_data).execute()
            self.filings_processed_today += 1
            logger.info(f"[STORE] Signal stored (legacy): {signal_data['ticker']} | {signal_data['signal']}")
        except Exception as e:
            logger.error(f"[STORE] Failed to store signal (continuing): {e}")
            return

        if signal_data["signal"] != "Pending" and self.telegram_enabled:
            try:
                from telegram_bot import send_signal_alert
                send_signal_alert(signal_data)
            except Exception as e:
                logger.error(f"[TELEGRAM] Alert failed (non-fatal): {e}")

    def _resolve_ticker_from_cik(self, cik):
        """3-step fallback chain for CIK -> ticker resolution.

        Step 1: SEC submissions JSON tickers field.
        Step 2: yfinance company name search.
        Step 3: Fallback to UNKNOWN__{cik} for reconciliation — never drops a filing.
        """
        padded_cik = str(cik).zfill(10)
        company_name = ""

        # Step 1: SEC submissions JSON
        try:
            url = f"https://data.sec.gov/submissions/CIK{padded_cik}.json"
            with httpx.Client(timeout=10, headers={"User-Agent": EDGAR_USER_AGENT}) as client:
                resp = client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    tickers = data.get("tickers", [])
                    company_name = data.get("name", "")
                    if tickers:
                        resolved = tickers[0].upper()
                        logger.info(f"[CIK] Step1: CIK {cik} -> {resolved} ({company_name})")
                        return resolved, company_name or "Unknown Company"
        except Exception as e:
            logger.warning(f"[CIK] Step1 failed for {cik}: {e}")

        # Step 2: yfinance search by company name
        if company_name:
            try:
                import yfinance as yf
                search_results = yf.Search(company_name, max_results=1)
                if hasattr(search_results, "quotes") and search_results.quotes:
                    ticker_sym = search_results.quotes[0].get("symbol", "")
                    if ticker_sym:
                        logger.info(f"[CIK] Step2: CIK {cik} resolved via yfinance: {ticker_sym}")
                        return ticker_sym.upper(), company_name or "Unknown Company"
            except Exception as e:
                logger.warning(f"[CIK] Step2 yfinance failed for {cik} ({company_name}): {e}")

        # Step 3: Fallback with CIK for reconciliation — never drop a filing
        fallback = f"UNKNOWN__{cik}"
        logger.warning(f"[CIK] Step3: CIK {cik} ({company_name}) unresolvable — using {fallback}")
        return fallback, company_name or "Unknown Company"

    def _extract_filing_text(self, filing_url, accession_number, cik, form_type: str = "8-K"):
        """
        Extract filing text using form-specific strategy.
        Large forms (10-K, 10-Q) skip TinyFish entirely — SEC structured APIs are faster.
        Short forms (8-K, 4, SC 13D) use existing TinyFish → EFTS → HTTP fallback chain.
        """
        LARGE_FORM_TYPES = {"10-K", "10-K/A", "10-Q", "10-Q/A"}
        if form_type in LARGE_FORM_TYPES:
            # For large filings use synchronous SEC API chain (no TinyFish browser render)
            return self._extract_large_form_sync(filing_url, accession_number, cik, form_type)

        # Short forms: TinyFish → EFTS → HTTP
        if self.use_tinyfish and self.tinyfish_api_key:
            try:
                text = self._extract_via_tinyfish(filing_url)
                if text and len(text) > 100:
                    return text
            except Exception as e:
                logger.warning(f"[EXTRACT] TinyFish failed: {e}")

        try:
            text = self._extract_via_efts(accession_number)
            if text and len(text) > 100:
                return text
        except Exception as e:
            logger.warning(f"[EXTRACT] EFTS failed: {e}")

        return self._extract_via_http(filing_url, accession_number, cik)

    def _extract_large_form_sync(self, filing_url, accession_number, cik, form_type):
        """
        Synchronous SEC structured API extraction for 10-K / 10-Q.
        Uses XBRL facts + submissions metadata. Completes in <5 seconds.
        """
        cik_str = str(cik).lstrip("0") if cik else ""
        if not cik_str and accession_number:
            cik_str = accession_number.split("-")[0].lstrip("0")

        headers = {"User-Agent": EDGAR_USER_AGENT}
        results: list[str] = []

        with httpx.Client(timeout=12, follow_redirects=True, headers=headers) as client:
            # Source 1: XBRL facts
            if cik_str:
                try:
                    r = client.get(
                        f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik_str.zfill(10)}.json"
                    )
                    if r.status_code == 200:
                        facts = r.json()
                        entity_name = facts.get("entityName", "")
                        us_gaap = facts.get("facts", {}).get("us-gaap", {})
                        lines = [
                            f"Company: {entity_name}",
                            f"Form: {form_type}",
                            "Source: SEC EDGAR XBRL Company Facts",
                            "",
                        ]
                        METRICS = {
                            "Revenues": "Total Revenue",
                            "RevenueFromContractWithCustomerExcludingAssessedTax": "Revenue",
                            "NetIncomeLoss": "Net Income",
                            "EarningsPerShareBasic": "EPS Basic",
                            "EarningsPerShareDiluted": "EPS Diluted",
                            "OperatingIncomeLoss": "Operating Income",
                            "GrossProfit": "Gross Profit",
                            "Assets": "Total Assets",
                            "CashAndCashEquivalentsAtCarryingValue": "Cash",
                            "LongTermDebt": "Long-term Debt",
                            "NetCashProvidedByUsedInOperatingActivities": "Operating Cash Flow",
                        }
                        found = 0
                        for xbrl_key, label in METRICS.items():
                            if xbrl_key not in us_gaap:
                                continue
                            units = us_gaap[xbrl_key].get("units", {})
                            values = units.get("USD", [])
                            if not values:
                                continue
                            annual = [
                                v for v in values
                                if v.get("form") in ("10-K", "10-K/A", "10-Q", "10-Q/A")
                                and v.get("val") is not None
                            ]
                            if not annual:
                                continue
                            annual.sort(key=lambda x: x.get("end", ""), reverse=True)
                            latest = annual[0]
                            val = latest.get("val", 0)
                            end = latest.get("end", "")
                            if abs(val) >= 1_000_000_000:
                                fmt = f"${val/1_000_000_000:.2f}B"
                            elif abs(val) >= 1_000_000:
                                fmt = f"${val/1_000_000:.1f}M"
                            else:
                                fmt = str(val)
                            lines.append(f"{label}: {fmt} (period ending {end})")
                            found += 1
                        if found > 0:
                            results.append("\n".join(lines))
                            logger.info(f"[EXTRACT] XBRL facts: {found} metrics")
                except Exception as e:
                    logger.warning(f"[EXTRACT] XBRL facts failed: {e}")

            # Source 2: Submissions metadata
            if cik_str:
                try:
                    r = client.get(
                        f"https://data.sec.gov/submissions/CIK{cik_str.zfill(10)}.json"
                    )
                    if r.status_code == 200:
                        s = r.json()
                        meta = (
                            f"Company: {s.get('name', '')} SIC: {s.get('sic', '')} "
                            f"({s.get('sicDescription', '')})"
                        )
                        results.append(meta)
                except Exception as e:
                    logger.warning(f"[EXTRACT] Submissions meta failed: {e}")

        if results:
            combined = "\n\n---\n\n".join(results)
            logger.info(f"[EXTRACT] SEC API combined: {len(combined)} chars for {form_type}")
            return combined[:12000]

        # Fallback to HTTP scrape capped at 150KB
        logger.warning(f"[EXTRACT] SEC API empty for {form_type} — HTTP fallback")
        return self._extract_via_http(filing_url, accession_number, cik)

    def _extract_via_efts(self, accession_number):
        """Fallback 1: SEC EDGAR full-text search API."""
        try:
            url = f"https://efts.sec.gov/LATEST/search-index?q=%22{accession_number}%22&forms=8-K"
            with httpx.Client(timeout=20, headers={"User-Agent": EDGAR_USER_AGENT}) as client:
                resp = client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    hits = data.get("hits", {}).get("hits", [])
                    if hits:
                        text = hits[0].get("_source", {}).get("file_text", "")
                        if text:
                            logger.info(f"[SEC_EFTS] Got {len(text)} chars")
                            return text[:8000]
        except Exception as e:
            logger.warning(f"[SEC_EFTS] Failed: {e}")
        return ""

    def _extract_via_tinyfish(self, filing_url):
        """Use TinyFish as NAVIGATOR ONLY — finds primary document URL, then backend downloads directly."""
        if not self.use_tinyfish or not self.tinyfish_api_key:
            return ""

        # TinyFish navigates the INDEX page to find the primary document URL
        goal = (
            "Navigate to this EDGAR filing index page. "
            "Find the PRIMARY document (the main filing document — NOT exhibits like ex-99, ex-31, ex-32). "
            "The primary document is the first .htm or .txt file, described with the filing type. "
            "Return ONLY this JSON: {\"document_url\": \"https://www.sec.gov/Archives/edgar/...\"}"
        )
        try:
            with requests.post(
                "https://agent.tinyfish.ai/v1/automation/run-sse",
                headers={
                    "X-API-Key": self.tinyfish_api_key,
                    "Content-Type": "application/json"
                },
                json={
                    "url": filing_url,
                    "goal": goal,
                    "browser_profile": "stealth"
                },
                stream=True,
                timeout=30  # 30s max, not 600s
            ) as response:
                if response.status_code != 200:
                    logger.error(f"[TINYFISH] HTTP {response.status_code}")
                    return ""

                document_url = ""
                for line in response.iter_lines():
                    line = line.decode("utf-8") if isinstance(line, bytes) else line
                    if not line or not line.startswith("data:"):
                        continue
                    try:
                        raw = line[5:].strip()
                        if not raw:
                            continue
                        event = json.loads(raw)

                        if event.get("type") == "PROGRESS":
                            logger.debug(f"[TINYFISH] {event.get('message', '')}")
                        elif event.get("type") == "COMPLETE":
                            if event.get("status") == "COMPLETED":
                                result = event.get("resultJson") or event.get("result", "")
                                if isinstance(result, dict):
                                    document_url = result.get("document_url", "")
                                elif isinstance(result, str):
                                    try:
                                        parsed = json.loads(result)
                                        document_url = parsed.get("document_url", "")
                                    except json.JSONDecodeError:
                                        pass
                                logger.info(f"[TINYFISH] Navigator found URL: {document_url}")
                            break
                        elif event.get("type") == "ERROR":
                            logger.error(f"[TINYFISH] Error: {event.get('message', event)}")
                            break
                    except json.JSONDecodeError:
                        continue

                # Now download the document directly — fast HTTP, not TinyFish
                if document_url:
                    if not document_url.startswith("http"):
                        document_url = f"https://www.sec.gov{document_url}" if document_url.startswith("/") else ""
                    if document_url:
                        try:
                            doc_resp = requests.get(
                                document_url,
                                timeout=10,
                                headers={"User-Agent": "AFI/1.0 info@afi.com"}
                            )
                            if doc_resp.status_code == 200:
                                logger.info(f"[TINYFISH] Downloaded {len(doc_resp.text)} chars from {document_url}")
                                return doc_resp.text[:8000]
                        except Exception as e:
                            logger.warning(f"[TINYFISH] Document download failed: {e}")

                return ""
        except Exception as e:
            logger.error(f"[TINYFISH] Navigation failed: {e}")
            return ""

    async def _enrich_signal_async(self, signal_id: str, ticker: str,
                                     accession_number: str, cik: str,
                                     company_name: str):
        """Run v3 enrichment agents and update the signal in Supabase."""
        try:
            from intelligence.enrichment_pipeline import (
                run_enrichment_agents, download_document,
                run_divergence_analysis, build_enrichment_columns
            )
            logger.info(f"[ENRICHMENT] Starting for {ticker} signal {signal_id}")

            enrichment = await run_enrichment_agents(ticker, accession_number, cik, company_name)

            # Download document via edgar agent result
            doc_url = enrichment.get("edgar", {}).get("document_url", "")
            document_text = await download_document(doc_url)

            # Run divergence analysis
            ir_text = enrichment.get("divergence", {}).get("latest_statement_text", "")
            divergence_data = {}
            if document_text and ir_text:
                divergence_data = await run_divergence_analysis(document_text, ir_text)

            # Build flat columns for Supabase update
            columns = build_enrichment_columns(enrichment, divergence_data)

            # Compute enhanced divergence score from enrichment data
            try:
                social = enrichment.get("social", {})
                news = enrichment.get("news", {})
                reddit_score = float(social.get("reddit_sentiment") or 0)
                stocktwits_score = float(social.get("stocktwits_sentiment") or 0)
                social_avg = (reddit_score + stocktwits_score) / 2
                news_sentiment = str(news.get("sentiment_score") or "neutral")
                # Convert numeric score to label
                try:
                    ns_float = float(news_sentiment)
                    news_sentiment = "positive" if ns_float > 0.2 else ("negative" if ns_float < -0.2 else "neutral")
                except (ValueError, TypeError):
                    news_sentiment = (news_sentiment or "neutral").lower()

                # Get the stored signal for this record
                sig_row = self.supabase.table("signals").select("signal,confidence").eq("id", signal_id).execute()
                if sig_row.data:
                    filing_signal = sig_row.data[0].get("signal", "Neutral")
                    confidence = int(sig_row.data[0].get("confidence") or 0)
                    enhanced_divergence_score = 0
                    enhanced_divergence_type = "NONE"
                    enhanced_contradiction = ""

                    if filing_signal == "Positive" and news_sentiment in ("negative", "bearish"):
                        enhanced_divergence_score = min(40 + confidence // 3, 85)
                        enhanced_divergence_type = "POSITIVE_FILING_NEGATIVE_NEWS"
                        enhanced_contradiction = (
                            f"{ticker} filing positive (conf:{confidence}%) "
                            f"but news coverage negative. Management optimism vs market reality."
                        )
                    elif filing_signal == "Risk" and news_sentiment in ("positive", "bullish"):
                        enhanced_divergence_score = min(35 + confidence // 3, 80)
                        enhanced_divergence_type = "RISK_FILING_POSITIVE_PR"
                        enhanced_contradiction = (
                            f"{ticker} SEC filing reveals risk signals "
                            f"while public messaging stays positive. Classic SAID vs FILED pattern."
                        )
                    elif filing_signal == "Positive" and social_avg < -0.4:
                        enhanced_divergence_score = min(25 + int(abs(social_avg) * 35), 65)
                        enhanced_divergence_type = "SOCIAL_BEARISH_VS_POSITIVE_FILING"
                        enhanced_contradiction = (
                            f"Social sentiment ({social_avg:.2f}) strongly contradicts positive SEC disclosure."
                        )

                    if enhanced_divergence_score > 0:
                        severity = (
                            "CRITICAL" if enhanced_divergence_score >= 70 else
                            "HIGH"     if enhanced_divergence_score >= 50 else
                            "MEDIUM"   if enhanced_divergence_score >= 30 else
                            "LOW"
                        )
                        # Only override divergence if enhanced score is higher
                        existing_div = int(columns.get("divergence_score") or 0)
                        if enhanced_divergence_score > existing_div:
                            columns["divergence_score"] = enhanced_divergence_score
                            columns["divergence_type"] = enhanced_divergence_type
                            columns["divergence_details"] = enhanced_contradiction
                            columns["divergence_severity"] = severity
                            logger.info(
                                f"[ENRICHMENT] Enhanced divergence for {ticker}: "
                                f"{enhanced_divergence_type} score={enhanced_divergence_score} ({severity})"
                            )
            except Exception as div_err:
                logger.warning(f"[ENRICHMENT] Enhanced divergence compute error: {div_err}")

            if columns:
                self.supabase.table("signals").update(columns).eq("id", signal_id).execute()
                logger.info(f"[ENRICHMENT] Updated signal {signal_id} with {len(columns)} enrichment fields")
            else:
                logger.info(f"[ENRICHMENT] No enrichment data for {signal_id}")

        except Exception as e:
            logger.error(f"[ENRICHMENT] Failed for {ticker}: {e}", exc_info=True)



    def _extract_via_http(self, filing_url, accession_number, cik):
        """Fallback 2: SEC EDGAR atom feed — gets filing description"""
        if not cik:
            return ""
        try:
            import xml.etree.ElementTree as ET
            url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=8-K&dateb=&owner=include&count=5&output=atom"
            with httpx.Client(timeout=15, headers={"User-Agent": EDGAR_USER_AGENT}, follow_redirects=True) as client:
                resp = client.get(url)
                if resp.status_code == 200:
                    root = ET.fromstring(resp.text)
                    ns = {"atom": "http://www.w3.org/2005/Atom"}
                    for entry in root.findall("atom:entry", ns):
                        entry_id = entry.findtext("atom:id", default="", namespaces=ns)
                        if accession_number.replace("-", "") in entry_id.replace("-", ""):
                            summary = entry.findtext("atom:summary", default="", namespaces=ns)
                            title = entry.findtext("atom:title", default="", namespaces=ns)
                            if summary or title:
                                logger.info(f"[SEC_ATOM] Got metadata for {accession_number}")
                                return f"{title}\\n{summary}"
        except Exception as e:
            logger.warning(f"[SEC_ATOM] Failed: {e}")
        return ""

    def _classify_filing(self, filing_text):
        """Legacy: Classify filing using Gemini API (used only as fallback)."""
        gemini_key = os.environ.get("GEMINI_API_KEY", "")

        if not gemini_key or gemini_key == "YOUR_GEMINI_KEY_HERE" or gemini_key.startswith("YOUR_"):
            return {
                "ticker": "UNKNOWN",
                "company": "Unknown",
                "summary": "Pending AI classification",
                "signal": "Pending",
                "confidence": 0,
            }

        try:
            from google import genai as genai_new
            from google.genai import types as genai_types

            CLASSIFICATION_SYSTEM_PROMPT = """You are a financial regulatory analyst. Given an SEC 8-K filing text, return ONLY a JSON object with no explanation:
{
  "ticker": "stock ticker or UNKNOWN",
  "company": "full company name",
  "summary": "one sentence plain English summary, max 25 words",
  "signal": "Positive or Neutral or Risk",
  "confidence": integer 0-100
}
Classify as Risk if: executive departure, litigation, debt issues, restatement, going concern.
Classify as Positive if: revenue beat, new contract, buyback, leadership upgrade.
Classify as Neutral for routine administrative filings."""

            client = genai_new.Client(api_key=gemini_key)
            prompt = f"{CLASSIFICATION_SYSTEM_PROMPT}\n\nAnalyze this SEC 8-K filing:\n\n{filing_text[:12000]}"

            response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
            response_text = response.text.strip()

            if response_text.startswith("```"):
                parts = response_text.split("```")
                if len(parts) >= 3:
                    response_text = parts[1]
                    if response_text.startswith("json"):
                        response_text = response_text[4:]

            response_text = response_text.strip()
            result = json.loads(response_text)

            return {
                "ticker": str(result.get("ticker", "UNKNOWN")).upper(),
                "company": str(result.get("company", "Unknown")),
                "summary": str(result.get("summary", ""))[:200],
                "signal": result.get("signal", "Neutral") if result.get("signal") in ("Positive", "Neutral", "Risk") else "Neutral",
                "confidence": min(100, max(0, int(result.get("confidence", 50)))),
            }
        except Exception as e:
            logger.error(f"[CLASSIFY] Legacy classification error: {e}")
            return {
                "ticker": "UNKNOWN",
                "company": "Unknown",
                "summary": f"AI classification failed: {str(e)[:100]}",
                "signal": "Pending",
                "confidence": 0,
            }


async def backfill_recent_filings(supabase_client, pipeline, days_back: int = 5):
    """Process all EDGAR filings from last N days that failed or were never processed."""
    from datetime import datetime, timedelta
    import httpx

    start = (datetime.now() - timedelta(days=days_back)).strftime("%Y-%m-%d")
    end = datetime.now().strftime("%Y-%m-%d")

    logger.info(f"[BACKFILL] Starting {days_back}-day backfill from {start} to {end}...")

    forms_str = "8-K,10-K,10-Q,4,SC+13D,S-1"
    url = (
        f"https://efts.sec.gov/LATEST/search-index?"
        f"q=%22%22&forms={forms_str}"
        f"&dateRange=custom&startdt={start}&enddt={end}"
    )

    try:
        async with httpx.AsyncClient(
            timeout=20.0,
            headers={"User-Agent": EDGAR_USER_AGENT}
        ) as client:
            r = await client.get(url)
            if r.status_code != 200:
                logger.error(f"[BACKFILL] EDGAR returned HTTP {r.status_code}")
                return {"error": f"HTTP {r.status_code}", "processed": 0}

            data = r.json()
            hits = data.get("hits", {}).get("hits", [])
            total = data.get("hits", {}).get("total", {}).get("value", 0)
            logger.info(f"[BACKFILL] Found {total} filings to check ({len(hits)} returned)")

            processed = 0
            skipped = 0

            for hit in hits:
                src = hit.get("_source", hit)
                accession = src.get("accession_no", "") or src.get("adsh", "")
                if not accession:
                    continue

                try:
                    existing = supabase_client.table("signals").select("id,confidence").eq(
                        "accession_number", accession
                    ).execute()
                    if existing.data and existing.data[0].get("confidence", 0) > 0:
                        skipped += 1
                        continue
                except Exception:
                    pass

                try:
                    from signal_pipeline import RawFiling
                    entity_name = src.get("entity_name", "") or src.get("display_names", "Unknown")
                    if isinstance(entity_name, list):
                        entity_name = entity_name[0] if entity_name else "Unknown"

                    filing = RawFiling(
                        accession_number=accession,
                        filing_type=src.get("form_type", "8-K"),
                        company_name=str(entity_name),
                        entity_id=str(src.get("entity_id", src.get("cik", ""))),
                        filed_at=src.get("file_date", datetime.now().isoformat()),
                        filing_url="",
                    )
                    result = await asyncio.to_thread(
                        pipeline.process, filing, [], "backfill"
                    )
                    if result:
                        processed += 1
                    await asyncio.sleep(0.3)
                except Exception as e:
                    logger.warning(f"[BACKFILL] Error processing {accession}: {e}")

            logger.info(f"[BACKFILL] Complete: {processed} processed, {skipped} skipped")
            return {"processed": processed, "skipped": skipped, "total_found": total}

    except Exception as e:
        logger.error(f"[BACKFILL] Failed: {e}")
        return {"error": str(e), "processed": 0}
