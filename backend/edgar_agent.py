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
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)

# EDGAR endpoints
EDGAR_BASE_URL = "https://www.sec.gov"
TINYFISH_BASE_URL = "https://api.tinyfish.io"
EDGAR_USER_AGENT = "AFI-Bot/1.0 (afi@tinyfish.io)"
TELEGRAM_IMPACT_THRESHOLD = int(os.environ.get("TELEGRAM_IMPACT_THRESHOLD", "40"))


class EdgarAgent:
    """Polls SEC EDGAR for new 8-K filings and delegates to SignalPipeline."""

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
        self.poll_interval = 120  # 2 minutes

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

    def get_status(self):
        """Return current agent status."""
        next_poll = None
        if self.running and self._poll_start_time:
            elapsed = (datetime.now(timezone.utc) - self._poll_start_time).total_seconds()
            remaining = max(0, self.poll_interval - elapsed)
            next_poll = int(remaining)

        status = {
            "agent_status": "running" if self.running else "stopped",
            "last_poll_time": self.last_poll_time.isoformat() if self.last_poll_time else None,
            "filings_processed_today": self.filings_processed_today,
            "next_poll_seconds": next_poll,
            "poll_interval": self.poll_interval,
            "config_version": self._config_version,
            "tier1_count": len(self._tier1_tickers),
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
        """Main polling loop — runs every 2 minutes."""
        while not self._stop_event.is_set():
            self._poll_start_time = datetime.now(timezone.utc)
            try:
                # Load config and process promotions at START of each cycle
                self._load_config()
                self._load_watchlist_tickers()
                
                logger.info("--- EDGAR POLL CYCLE START ---")
                self._poll_edgar()
                logger.info("--- EDGAR POLL CYCLE COMPLETE ---")
            except Exception as e:
                logger.error(f"EDGAR poll cycle failed (non-fatal): {e}")
            self._stop_event.wait(self.poll_interval)

    def _poll_edgar(self):
        """Query EDGAR for new 8-K filings."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # Reset daily counter
        if self._today_date != today:
            self._today_date = today
            self.filings_processed_today = 0

        logger.info(f"[POLL] Querying EDGAR for 8-K filings on {today}")

        # Try multiple EDGAR API approaches
        filings = []

        # Approach 1: EFTS full-text search
        try:
            logger.info("[POLL] Trying EFTS full-text search...")
            with httpx.Client(timeout=30, headers={"User-Agent": EDGAR_USER_AGENT}) as client:
                response = client.get(
                    "https://efts.sec.gov/LATEST/search-index",
                    params={
                        "q": '"8-K"',
                        "forms": "8-K",
                        "dateRange": "custom",
                        "startdt": today,
                        "enddt": today,
                    },
                )
                if response.status_code == 200:
                    data = response.json()
                    filings = data.get("hits", {}).get("hits", [])
                    if not filings:
                        filings = data.get("filings", [])
                    logger.info(f"[POLL] EFTS returned {len(filings)} results")
                else:
                    logger.warning(f"[POLL] EFTS returned HTTP {response.status_code}")
        except Exception as e:
            logger.warning(f"[POLL] EFTS search failed: {e}")

        # Approach 2: EDGAR full-text search API
        if not filings:
            try:
                logger.info("[POLL] Trying EDGAR full-text search API...")
                with httpx.Client(timeout=30, headers={"User-Agent": EDGAR_USER_AGENT}) as client:
                    response = client.get(
                        "https://efts.sec.gov/LATEST/search-index",
                        params={
                            "q": '"8-K"',
                            "dateRange": "custom",
                            "startdt": today,
                            "enddt": today,
                        },
                    )
                    if response.status_code == 200:
                        data = response.json()
                        filings = data.get("hits", {}).get("hits", [])
                        if not filings:
                            filings = data.get("filings", [])
                        logger.info(f"[POLL] Full-text search returned {len(filings)} results")
                    else:
                        logger.warning(f"[POLL] Full-text search returned HTTP {response.status_code}")
            except Exception as e:
                logger.warning(f"[POLL] Full-text search failed: {e}")

        # Approach 3: EDGAR recent filings RSS/JSON
        if not filings:
            try:
                logger.info("[POLL] Trying EDGAR recent filings feed...")
                with httpx.Client(timeout=30, headers={"User-Agent": EDGAR_USER_AGENT}) as client:
                    response = client.get(
                        "https://www.sec.gov/cgi-bin/browse-edgar",
                        params={
                            "action": "getcurrent",
                            "type": "8-K",
                            "dateb": "",
                            "owner": "include",
                            "count": "20",
                            "search_text": "",
                            "output": "atom",
                        },
                    )
                    if response.status_code == 200:
                        entries = re.findall(r'<accession-number>(.*?)</accession-number>', response.text)
                        company_names = re.findall(r'<company-name>(.*?)</company-name>', response.text)
                        ciks = re.findall(r'<cik>(.*?)</cik>', response.text)
                        for i, acc in enumerate(entries[:20]):
                            filings.append({
                                "accession_no": acc,
                                "entity_name": company_names[i] if i < len(company_names) else "Unknown",
                                "entity_id": ciks[i] if i < len(ciks) else "",
                                "file_date": today,
                            })
                        logger.info(f"[POLL] RSS feed returned {len(filings)} results")
                    else:
                        logger.warning(f"[POLL] RSS feed returned HTTP {response.status_code}")
            except Exception as e:
                logger.warning(f"[POLL] RSS feed failed: {e}")

        self.last_poll_time = datetime.now(timezone.utc)

        if not filings:
            logger.info("[POLL] No filings found across all search methods. This is normal outside market hours.")
            return

        logger.info(f"[POLL] Processing {min(len(filings), 20)} of {len(filings)} filings...")

        for filing_data in filings[:20]:
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

        # Check if already processed
        try:
            result = self.supabase.table("signals").select("id").eq(
                "accession_number", accession_number
            ).execute()
            if result.data:
                logger.info(f"[PROCESS] Already processed {accession_number}, skipping")
                return
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
            if resolved_ticker and resolved_ticker != "UNKNOWN":
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

        logger.info(f"[EXTRACT] Extracting text from: {filing_url}")

        # Extract filing text
        filing_text = None
        try:
            filing_text = self._extract_filing_text(filing_url, accession_number, entity_id)
        except Exception as e:
            logger.error(f"[EXTRACT] Text extraction failed (continuing): {e}")

        if not filing_text:
            logger.warning(f"[EXTRACT] No text extracted for {accession_number}, using fallback")
            filing_text = f"8-K filing by {company_name}. Accession: {accession_number}."

        # --- PIPELINE INTEGRATION ---
        if self._pipeline:
            from signal_pipeline import RawFiling
            
            raw_filing = RawFiling(
                accession_number=accession_number,
                filing_type="8-K",
                company_name=company_name,
                entity_id=str(entity_id),
                filed_at=filed_at,
                filing_url=filing_url,
                filing_text=filing_text,
            )
            
            signal = self._pipeline.process(raw_filing, watchlist_tickers=self._watchlist_tickers)
            
            if signal:
                # Override ticker if CIK resolution found a real one
                if resolved_ticker and resolved_ticker != "UNKNOWN" and signal.ticker == "UNKNOWN":
                    signal.ticker = resolved_ticker
                
                # Store enriched signal
                signal_row = self._pipeline.signal_to_db_row(signal)
                try:
                    result = self.supabase.table("signals").insert(signal_row).execute()
                    self.filings_processed_today += 1
                    logger.info(
                        f"[STORE] Signal stored: {signal.ticker} | {signal.signal} | "
                        f"conf={signal.confidence} | event={signal.event_type} | "
                        f"impact={signal.impact_score}"
                    )
                    
                    # Schedule price tracking
                    if self._price_tracker and result.data:
                        stored_id = result.data[0].get("id") if result.data else None
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
        """Resolve ticker and company name from SEC CIK number."""
        try:
            padded_cik = str(cik).zfill(10)
            url = f"https://data.sec.gov/submissions/CIK{padded_cik}.json"
            with httpx.Client(timeout=10, headers={"User-Agent": EDGAR_USER_AGENT}) as client:
                resp = client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    tickers = data.get("tickers", [])
                    name = data.get("name", "Unknown")
                    ticker = tickers[0].upper() if tickers else "UNKNOWN"
                    if ticker != "UNKNOWN":
                        logger.info(f"[CIK] Resolved CIK {cik} → {ticker} ({name})")
                    return ticker, name
        except Exception as e:
            logger.warning(f"[CIK] Resolution failed for {cik}: {e}")
        return "UNKNOWN", "Unknown Company"

    def _extract_filing_text(self, filing_url, accession_number, cik):
        """Extract filing text. Fallback chain: TinyFish → SEC EFTS → Atom Scrape."""
        # Step 1: TinyFish Web Agent
        if self.use_tinyfish and self.tinyfish_api_key:
            try:
                text = self._extract_via_tinyfish(filing_url)
                if text and len(text) > 100:
                    return text
            except Exception as e:
                logger.warning(f"[EXTRACT] TinyFish failed: {e}")

        # Step 2: SEC EFTS full-text search
        try:
            text = self._extract_via_efts(accession_number)
            if text and len(text) > 100:
                return text
        except Exception as e:
            logger.warning(f"[EXTRACT] EFTS failed: {e}")

        # Step 3: Direct HTTP atom feed scrape
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
        """Use TinyFish Web Agent API (SSE stream) to navigate and extract filing text."""
        import requests
        if not self.use_tinyfish or not self.tinyfish_api_key:
            return ""
            
        goal = (
            "Extract the full text content of this SEC 8-K filing. "
            "Return the complete text of all items disclosed, including any financial figures, "
            "executive changes, agreements, or events described. "
            "Return as plain text JSON: {\"text\": \"<full filing content>\"}"
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
                timeout=90
            ) as response:
                if response.status_code != 200:
                    logger.error(f"[TINYFISH] HTTP {response.status_code}")
                    return ""
                
                result_text = ""
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
                            logger.debug(f"[TINYFISH] Progress: {event.get('message', '')}")
                        elif event.get("type") == "COMPLETE":
                            if event.get("status") == "COMPLETED":
                                result = event.get("resultJson") or event.get("result", "")
                                if isinstance(result, dict):
                                    result_text = result.get("text", str(result))
                                elif isinstance(result, str):
                                    try:
                                        parsed = json.loads(result)
                                        result_text = parsed.get("text", result)
                                    except json.JSONDecodeError:
                                        result_text = result
                                logger.info(f"[TINYFISH] Success: {len(result_text)} chars extracted")
                            else:
                                logger.warning(f"[TINYFISH] Run ended with status: {event.get('status')}")
                            break
                        elif event.get("type") == "ERROR":
                            logger.error(f"[TINYFISH] Agent error: {event.get('message', event)}")
                            break
                    except json.JSONDecodeError:
                        continue
                return result_text[:8000]
        except Exception as e:
            logger.error(f"[TINYFISH] Extraction failed: {e}")
            return ""

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
            import google.generativeai as genai
            genai.configure(api_key=gemini_key)

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

            model = genai.GenerativeModel('gemini-2.5-flash')
            prompt = f"{CLASSIFICATION_SYSTEM_PROMPT}\n\nAnalyze this SEC 8-K filing:\n\n{filing_text[:12000]}"

            response = model.generate_content(prompt)
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
