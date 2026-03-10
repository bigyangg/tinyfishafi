# edgar_agent.py — EDGAR 8-K Filing Polling Agent
# Purpose: Poll SEC EDGAR for new 8-K filings, extract text via TinyFish or HTTP,
#          classify with Gemini AI, store in Supabase, trigger Telegram alerts
# Dependencies: httpx, google-generativeai, supabase
# Env vars: TINYFISH_API_KEY, GEMINI_API_KEY, USE_TINYFISH

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

# Correct EDGAR full-text search API
EDGAR_SEARCH_URL = "https://efts.sec.gov/LATEST/search-index"
EDGAR_FULLTEXT_URL = "https://efts.sec.gov/LATEST/search-index"
EDGAR_BASE_URL = "https://www.sec.gov"
TINYFISH_BASE_URL = "https://api.tinyfish.io"

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

# Standard User-Agent for SEC EDGAR requests
EDGAR_USER_AGENT = "AFI-Bot/1.0 (afi@tinyfish.io)"


class EdgarAgent:
    """Polls SEC EDGAR for new 8-K filings and processes them with AI."""

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
        self.gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
        self.use_tinyfish = os.environ.get("USE_TINYFISH", "true").lower() == "true"
        self.telegram_enabled = os.environ.get("TELEGRAM_ENABLED", "false").lower() == "true"

        self.poll_interval = 120  # 2 minutes

    def get_status(self):
        """Return current agent status."""
        next_poll = None
        if self.running and self._poll_start_time:
            elapsed = (datetime.now(timezone.utc) - self._poll_start_time).total_seconds()
            remaining = max(0, self.poll_interval - elapsed)
            next_poll = int(remaining)

        return {
            "agent_status": "running" if self.running else "stopped",
            "last_poll_time": self.last_poll_time.isoformat() if self.last_poll_time else None,
            "filings_processed_today": self.filings_processed_today,
            "next_poll_seconds": next_poll,
            "poll_interval": self.poll_interval,
        }

    def start(self):
        """Start the polling loop in a background thread."""
        if self.running:
            logger.info("EDGAR agent is already running")
            return
        self.running = True
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._thread.start()
        logger.info("EDGAR polling agent started (interval: %ds)", self.poll_interval)

    def stop(self):
        """Stop the polling loop."""
        self.running = False
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=10)
        logger.info("EDGAR polling agent stopped")

    def _poll_loop(self):
        """Main polling loop — runs every 2 minutes."""
        while not self._stop_event.is_set():
            self._poll_start_time = datetime.now(timezone.utc)
            try:
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
                        # Parse Atom XML for filing links
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
        """Process a single EDGAR filing."""
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
        
        # Build filing URL
        accession_clean = accession_number.replace("-", "")
        entity_id = source.get("entity_id", source.get("cik", ""))
        filing_url = f"{EDGAR_BASE_URL}/Archives/edgar/data/{entity_id}/{accession_clean}/{accession_number}-index.htm"

        logger.info(f"[EXTRACT] Extracting text from: {filing_url}")

        # Extract filing text
        filing_text = None
        try:
            filing_text = self._extract_filing_text(filing_url, accession_number)
        except Exception as e:
            logger.error(f"[EXTRACT] Text extraction failed (continuing): {e}")

        if not filing_text:
            logger.warning(f"[EXTRACT] No text extracted for {accession_number}, using fallback")
            filing_text = f"8-K filing by {company_name}. Accession: {accession_number}."

        # Classify with AI
        logger.info(f"[CLASSIFY] Sending to Gemini for classification...")
        classification = None
        try:
            classification = self._classify_filing(filing_text)
        except Exception as e:
            logger.error(f"[CLASSIFY] Classification failed (storing as Pending): {e}")
        
        if not classification:
            classification = {
                "ticker": "UNKNOWN",
                "company": company_name,
                "summary": f"8-K filing by {company_name}",
                "signal": "Pending",
                "confidence": 0,
            }

        # Store in Supabase
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
            logger.info(f"[STORE] Signal stored: {signal_data['ticker']} | {signal_data['signal']} | {signal_data['confidence']}%")
        except Exception as e:
            logger.error(f"[STORE] Failed to store signal (continuing): {e}")
            return

        # Send Telegram alert (only for real classifications, not Pending)
        if signal_data["signal"] != "Pending" and self.telegram_enabled:
            try:
                from telegram_bot import send_signal_alert
                send_signal_alert(signal_data)
                logger.info(f"[TELEGRAM] Alert sent for {signal_data['ticker']}")
            except Exception as e:
                logger.error(f"[TELEGRAM] Alert failed (non-fatal): {e}")

    def _extract_filing_text(self, filing_url, accession_number):
        """Extract filing text using TinyFish Web Agent or direct HTTP."""
        if self.use_tinyfish and self.tinyfish_api_key:
            try:
                text = self._extract_via_tinyfish(filing_url)
                if text:
                    return text
            except Exception as e:
                logger.warning(f"[EXTRACT] TinyFish failed, falling back to HTTP: {e}")
        return self._extract_via_http(filing_url, accession_number)

    def _extract_via_tinyfish(self, filing_url):
        """Use TinyFish Web Agent API to navigate and extract filing text."""
        try:
            with httpx.Client(timeout=120) as client:
                response = client.post(
                    f"{TINYFISH_BASE_URL}/v1/web-agent/tasks",
                    headers={
                        "Authorization": f"Bearer {self.tinyfish_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "url": filing_url,
                        "instructions": "Navigate to this SEC EDGAR filing index page. Find the primary HTM or TXT exhibit link (usually the main document, not the XML). Click on it. Extract and return the full document text content.",
                        "return_content": True,
                    },
                )
                response.raise_for_status()
                result = response.json()

                task_id = result.get("task_id", result.get("id", ""))
                if task_id:
                    for _ in range(30):
                        time.sleep(10)
                        status_resp = client.get(
                            f"{TINYFISH_BASE_URL}/v1/web-agent/tasks/{task_id}",
                            headers={"Authorization": f"Bearer {self.tinyfish_api_key}"},
                        )
                        status_data = status_resp.json()
                        if status_data.get("status") in ("completed", "done"):
                            return status_data.get("content", status_data.get("result", ""))
                        if status_data.get("status") in ("failed", "error"):
                            logger.warning(f"[TINYFISH] Task failed: {status_data}")
                            break

                return result.get("content", result.get("text", ""))
        except Exception as e:
            logger.error(f"[TINYFISH] Extraction failed: {e}")
            return None

    def _extract_via_http(self, filing_url, accession_number):
        """Fallback: directly download filing text via HTTP."""
        try:
            with httpx.Client(timeout=30, headers={"User-Agent": EDGAR_USER_AGENT}) as client:
                response = client.get(filing_url)
                if response.status_code == 200:
                    html = response.text
                    doc_links = re.findall(r'href="([^"]*\.(?:htm|txt))"', html, re.IGNORECASE)
                    for link in doc_links:
                        if "index" in link.lower() or link.endswith(".xml"):
                            continue
                        if link.startswith("http"):
                            doc_url = link
                        elif link.startswith("/"):
                            doc_url = f"{EDGAR_BASE_URL}{link}"
                        else:
                            base = filing_url.rsplit("/", 1)[0]
                            doc_url = f"{base}/{link}"

                        try:
                            doc_resp = client.get(doc_url)
                            if doc_resp.status_code == 200:
                                text = re.sub(r'<[^>]+>', ' ', doc_resp.text)
                                text = re.sub(r'\s+', ' ', text).strip()
                                return text[:15000]
                        except Exception as e:
                            logger.warning(f"[HTTP] Failed to fetch doc {doc_url}: {e}")
                            continue
                    
                    # If no doc links found, use the index page text
                    text = re.sub(r'<[^>]+>', ' ', html)
                    text = re.sub(r'\s+', ' ', text).strip()
                    return text[:15000]
                else:
                    logger.warning(f"[HTTP] Filing URL returned HTTP {response.status_code}")
        except Exception as e:
            logger.error(f"[HTTP] Extraction failed: {e}")
        return None

    def _classify_filing(self, filing_text):
        """Classify filing using Gemini API."""
        gemini_key = os.environ.get("GEMINI_API_KEY", "")

        if not gemini_key or gemini_key == "YOUR_GEMINI_KEY_HERE" or gemini_key.startswith("YOUR_"):
            logger.warning("[CLASSIFY] GEMINI_API_KEY is missing or placeholder")
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

            model = genai.GenerativeModel('gemini-2.5-flash')
            prompt = f"{CLASSIFICATION_SYSTEM_PROMPT}\n\nAnalyze this SEC 8-K filing:\n\n{filing_text[:12000]}"
            
            response = model.generate_content(prompt)
            response_text = response.text.strip()

            # Parse JSON response
            if response_text.startswith("```"):
                parts = response_text.split("```")
                if len(parts) >= 3:
                    response_text = parts[1]
                    if response_text.startswith("json"):
                        response_text = response_text[4:]
            
            response_text = response_text.strip()
            result = json.loads(response_text)

            classified = {
                "ticker": str(result.get("ticker", "UNKNOWN")).upper(),
                "company": str(result.get("company", "Unknown")),
                "summary": str(result.get("summary", ""))[:200],
                "signal": result.get("signal", "Neutral") if result.get("signal") in ("Positive", "Neutral", "Risk") else "Neutral",
                "confidence": min(100, max(0, int(result.get("confidence", 50)))),
            }
            logger.info(f"[CLASSIFY] Result: {classified['ticker']} | {classified['signal']} | {classified['confidence']}%")
            return classified
        except json.JSONDecodeError as e:
            logger.error(f"[CLASSIFY] Failed to parse AI response: {e}")
            return {
                "ticker": "UNKNOWN",
                "company": "Unknown",
                "summary": "AI classification returned invalid format",
                "signal": "Pending",
                "confidence": 0,
            }
        except Exception as e:
            logger.error(f"[CLASSIFY] AI classification error: {e}")
            return {
                "ticker": "UNKNOWN",
                "company": "Unknown",
                "summary": f"AI classification failed: {str(e)[:100]}",
                "signal": "Pending",
                "confidence": 0,
            }
