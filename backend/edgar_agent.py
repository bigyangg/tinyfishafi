# edgar_agent.py — EDGAR 8-K Filing Polling Agent
# Purpose: Poll SEC EDGAR for new 8-K filings, extract text via TinyFish or HTTP,
#          classify with Claude Sonnet, store in Supabase, trigger Telegram alerts
# Dependencies: httpx, anthropic, supabase
# Env vars: TINYFISH_API_KEY, ANTHROPIC_API_KEY, USE_TINYFISH

import os
import logging
import threading
import time
import json
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)

EDGAR_SEARCH_URL = "https://efts.sec.gov/LATEST/search-index"
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

        # Config from env
        self.tinyfish_api_key = os.environ.get("TINYFISH_API_KEY", "")
        self.anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        self.use_tinyfish = os.environ.get("USE_TINYFISH", "true").lower() == "true"
        self.telegram_enabled = os.environ.get("TELEGRAM_ENABLED", "false").lower() == "true"

        self.poll_interval = 300  # 5 minutes

    def get_status(self):
        """Return current agent status."""
        return {
            "agent_status": "running" if self.running else "stopped",
            "last_poll_time": self.last_poll_time.isoformat() if self.last_poll_time else None,
            "filings_processed_today": self.filings_processed_today,
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
        logger.info("EDGAR polling agent started")

    def stop(self):
        """Stop the polling loop."""
        self.running = False
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=10)
        logger.info("EDGAR polling agent stopped")

    def _poll_loop(self):
        """Main polling loop — runs every 5 minutes."""
        while not self._stop_event.is_set():
            try:
                self._poll_edgar()
            except Exception as e:
                logger.error(f"EDGAR poll error: {e}")
            self._stop_event.wait(self.poll_interval)

    def _poll_edgar(self):
        """Query EDGAR for new 8-K filings."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # Reset daily counter
        if self._today_date != today:
            self._today_date = today
            self.filings_processed_today = 0

        logger.info(f"Polling EDGAR for 8-K filings on {today}...")

        try:
            with httpx.Client(timeout=30, headers={"User-Agent": EDGAR_USER_AGENT}) as client:
                response = client.get(
                    EDGAR_SEARCH_URL,
                    params={
                        "q": '"8-K"',
                        "dateRange": "custom",
                        "startdt": today,
                        "enddt": today,
                    },
                )
                response.raise_for_status()
                data = response.json()
        except Exception as e:
            logger.error(f"EDGAR search API error: {e}")
            # Try alternative EDGAR full-text search endpoint
            try:
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
                    response.raise_for_status()
                    data = response.json()
            except Exception as e2:
                logger.error(f"EDGAR fallback search also failed: {e2}")
                self.last_poll_time = datetime.now(timezone.utc)
                return

        # Parse EDGAR response
        filings = data.get("hits", {}).get("hits", [])
        if not filings:
            # Try alternative response format
            filings = data.get("filings", [])

        logger.info(f"Found {len(filings)} 8-K filing results from EDGAR")
        self.last_poll_time = datetime.now(timezone.utc)

        for filing_data in filings[:20]:  # Process up to 20 per poll
            try:
                self._process_filing(filing_data)
            except Exception as e:
                logger.error(f"Error processing filing: {e}")

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
            logger.warning("Filing missing accession number, skipping")
            return

        # Check if already processed
        try:
            result = self.supabase.table("signals").select("id").eq(
                "accession_number", accession_number
            ).execute()
            if result.data:
                return  # Already processed
        except Exception as e:
            logger.warning(f"Error checking existing signal: {e}")

        # Extract filing metadata
        company_name = source.get("display_names", source.get("entity_name", ["Unknown"]))[0] if isinstance(source.get("display_names", source.get("entity_name")), list) else source.get("display_names", source.get("entity_name", "Unknown"))
        filed_at = source.get("file_date", source.get("filing_date", datetime.now(timezone.utc).isoformat()))
        
        # Build filing URL
        accession_clean = accession_number.replace("-", "")
        filing_url = f"{EDGAR_BASE_URL}/Archives/edgar/data/{source.get('entity_id', '')}/{accession_clean}/{accession_number}-index.htm"

        # Extract filing text
        filing_text = self._extract_filing_text(filing_url, accession_number)

        if not filing_text:
            logger.warning(f"Could not extract text for {accession_number}")
            filing_text = f"8-K filing by {company_name}. Accession: {accession_number}."

        # Classify with AI
        classification = self._classify_filing(filing_text)

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
            logger.info(f"Stored signal: {signal_data['ticker']} | {signal_data['signal']} | {signal_data['confidence']}%")

            # Send Telegram alert (only for real classifications, not Pending)
            if signal_data["signal"] != "Pending" and self.telegram_enabled:
                try:
                    from telegram_bot import send_signal_alert
                    send_signal_alert(signal_data)
                except Exception as e:
                    logger.error(f"Telegram alert failed: {e}")
        except Exception as e:
            logger.error(f"Failed to store signal: {e}")

    def _extract_filing_text(self, filing_url, accession_number):
        """Extract filing text using TinyFish Web Agent or direct HTTP."""
        if self.use_tinyfish and self.tinyfish_api_key:
            return self._extract_via_tinyfish(filing_url)
        return self._extract_via_http(filing_url, accession_number)

    def _extract_via_tinyfish(self, filing_url):
        """Use TinyFish Web Agent API to navigate and extract filing text."""
        try:
            with httpx.Client(timeout=120) as client:
                # Create a web agent task
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

                # Check task status / get content
                task_id = result.get("task_id", result.get("id", ""))
                if task_id:
                    # Poll for completion
                    for _ in range(30):  # Max 5 min wait
                        time.sleep(10)
                        status_resp = client.get(
                            f"{TINYFISH_BASE_URL}/v1/web-agent/tasks/{task_id}",
                            headers={"Authorization": f"Bearer {self.tinyfish_api_key}"},
                        )
                        status_data = status_resp.json()
                        if status_data.get("status") in ("completed", "done"):
                            return status_data.get("content", status_data.get("result", ""))
                        if status_data.get("status") in ("failed", "error"):
                            logger.warning(f"TinyFish task failed: {status_data}")
                            break

                # Direct result
                return result.get("content", result.get("text", ""))
        except Exception as e:
            logger.error(f"TinyFish extraction failed: {e}")
            # Fallback to HTTP
            return self._extract_via_http(filing_url, "")

    def _extract_via_http(self, filing_url, accession_number):
        """Fallback: directly download filing text via HTTP."""
        try:
            with httpx.Client(timeout=30, headers={"User-Agent": EDGAR_USER_AGENT}) as client:
                # First try the index page to find the main document
                response = client.get(filing_url)
                if response.status_code == 200:
                    html = response.text
                    # Look for links to .htm or .txt files
                    import re
                    doc_links = re.findall(r'href="([^"]*\.(?:htm|txt))"', html, re.IGNORECASE)
                    for link in doc_links:
                        # Skip index files and XML
                        if "index" in link.lower() or link.endswith(".xml"):
                            continue
                        # Build full URL
                        if link.startswith("http"):
                            doc_url = link
                        elif link.startswith("/"):
                            doc_url = f"{EDGAR_BASE_URL}{link}"
                        else:
                            # Relative URL
                            base = filing_url.rsplit("/", 1)[0]
                            doc_url = f"{base}/{link}"

                        doc_resp = client.get(doc_url)
                        if doc_resp.status_code == 200:
                            # Strip HTML tags for plain text
                            text = re.sub(r'<[^>]+>', ' ', doc_resp.text)
                            text = re.sub(r'\s+', ' ', text).strip()
                            return text[:15000]  # Limit to ~15k chars for AI
                    
                    # If no doc links found, use the index page text
                    text = re.sub(r'<[^>]+>', ' ', html)
                    text = re.sub(r'\s+', ' ', text).strip()
                    return text[:15000]
        except Exception as e:
            logger.error(f"HTTP extraction failed: {e}")
        return None

    def _classify_filing(self, filing_text):
        """Classify filing using Claude Sonnet AI."""
        anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")

        # Check if key is missing or placeholder
        if not anthropic_key or anthropic_key == "YOUR_ANTHROPIC_KEY_HERE" or anthropic_key.startswith("YOUR_"):
            logger.warning("ANTHROPIC_API_KEY is missing or placeholder — storing as Pending")
            return {
                "ticker": "UNKNOWN",
                "company": "Unknown",
                "summary": "Pending AI classification — ANTHROPIC_API_KEY not configured",
                "signal": "Pending",
                "confidence": 0,
            }

        try:
            import anthropic
            client = anthropic.Anthropic(api_key=anthropic_key)

            message = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=500,
                system=CLASSIFICATION_SYSTEM_PROMPT,
                messages=[
                    {"role": "user", "content": f"Analyze this SEC 8-K filing:\n\n{filing_text[:12000]}"}
                ],
            )

            response_text = message.content[0].text.strip()

            # Parse JSON response
            # Handle potential markdown code blocks
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
                response_text = response_text.strip()

            result = json.loads(response_text)

            # Validate result shape
            return {
                "ticker": str(result.get("ticker", "UNKNOWN")).upper(),
                "company": str(result.get("company", "Unknown")),
                "summary": str(result.get("summary", ""))[:200],
                "signal": result.get("signal", "Neutral") if result.get("signal") in ("Positive", "Neutral", "Risk") else "Neutral",
                "confidence": min(100, max(0, int(result.get("confidence", 50)))),
            }
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AI response: {e}")
            return {
                "ticker": "UNKNOWN",
                "company": "Unknown",
                "summary": "AI classification returned invalid format",
                "signal": "Pending",
                "confidence": 0,
            }
        except Exception as e:
            logger.error(f"AI classification error: {e}")
            return {
                "ticker": "UNKNOWN",
                "company": "Unknown",
                "summary": f"AI classification failed: {str(e)[:100]}",
                "signal": "Pending",
                "confidence": 0,
            }
