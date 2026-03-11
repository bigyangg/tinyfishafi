# telegram_bot.py — AFI Telegram Alert Bot
# Purpose: Send formatted signal alerts to Telegram when new filings are processed
# Dependencies: httpx
# Env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_ENABLED

import os
import logging
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")
TELEGRAM_ENABLED = os.environ.get("TELEGRAM_ENABLED", "false").lower() == "true"

# Signal emoji map
SIGNAL_EMOJI = {
    "Positive": "\U0001f7e2",  # green circle
    "Neutral": "\u26aa",       # white circle
    "Risk": "\U0001f534",      # red circle
}


def send_signal_alert(signal_data):
    """
    Send a formatted Telegram alert for a new signal using HTML parse mode.
    
    Args:
        signal_data: dict with keys: ticker, company, signal, summary, confidence, filed_at
    """
    if not TELEGRAM_ENABLED:
        logger.info("Telegram disabled — skipping alert")
        return

    signal_type = signal_data.get("signal", "Pending")
    if signal_type == "Pending":
        logger.info("Signal is Pending — skipping Telegram alert until AI classification completes")
        return

    if not BOT_TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN not set — cannot send alert")
        return

    if not CHAT_ID:
        logger.warning("TELEGRAM_CHAT_ID not set — cannot send alert")
        return

    try:
        ticker = _escape_html(signal_data.get("ticker", "UNKNOWN"))
        company = _escape_html(signal_data.get("company", "Unknown"))
        signal = signal_data.get("signal", "Neutral")
        summary = _escape_html(signal_data.get("summary", ""))
        confidence = signal_data.get("confidence", 0)
        filed_at = signal_data.get("filed_at", "")
        filing_type = _escape_html(signal_data.get("filing_type", "8-K"))
        event_type = signal_data.get("event_type")
        impact_score = signal_data.get("impact_score")
        accession = signal_data.get("accession_number", "")

        # Format date
        try:
            if filed_at:
                dt = datetime.fromisoformat(filed_at.replace("Z", "+00:00"))
                date_str = dt.strftime("%b %d, %Y")
            else:
                date_str = datetime.now().strftime("%b %d, %Y")
        except Exception:
            date_str = str(filed_at)[:10] if filed_at else "Unknown"

        emoji = SIGNAL_EMOJI.get(signal, "\u26aa")

        # Build SEC EDGAR URL
        edgar_url = ""
        if accession:
            clean = accession.replace("-", "")
            edgar_url = f"https://www.sec.gov/Archives/edgar/data/{clean}/{accession}-index.htm"

        # Build enrichment line if available
        enrichment = ""
        if event_type:
            enrichment += f"\nEvent: <code>{_escape_html(event_type)}</code>"
        if impact_score is not None:
            enrichment += f" | Impact: <code>{impact_score}/100</code>"

        message = (
            f"\U0001f535 <b>AFI ALERT</b>\n"
            f"\n"
            f"<code>{ticker}</code> — {filing_type}\n"
            f"Signal: {emoji} <b>{signal}</b>\n"
            f"{summary}\n"
            f"\n"
            f"Confidence: <code>{confidence}%</code> | {date_str}"
            f"{enrichment}\n"
        )

        if edgar_url:
            message += f'\n<a href="{edgar_url}">View on SEC EDGAR</a>'

        _send_telegram_message(message, parse_mode="HTML")
        logger.info(f"Telegram alert sent for {ticker} ({signal})")

    except Exception as e:
        logger.error(f"Failed to send Telegram alert: {e}")
        # Never crash the agent on Telegram failure


def _escape_html(text):
    """Escape special HTML characters to prevent parse errors."""
    if not text:
        return ""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _send_telegram_message(text, parse_mode="HTML"):
    """Send a message via Telegram Bot API using httpx (sync)."""
    try:
        import httpx
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": CHAT_ID,
            "text": text,
            "parse_mode": parse_mode,
        }
        with httpx.Client(timeout=10) as client:
            response = client.post(url, json=payload)
            if response.status_code == 200:
                logger.info(f"Telegram message sent successfully (chat_id={CHAT_ID})")
            else:
                logger.warning(f"Telegram API returned {response.status_code}: {response.text}")
    except Exception as e:
        logger.error(f"Telegram HTTP request failed: {e}")
        # Never crash — swallow the exception


def send_test_message():
    """Send a test message to verify Telegram bot configuration."""
    if not TELEGRAM_ENABLED:
        logger.info("Telegram is disabled (TELEGRAM_ENABLED=false)")
        return False

    if not BOT_TOKEN or not CHAT_ID:
        logger.warning(f"Missing config: BOT_TOKEN={'set' if BOT_TOKEN else 'missing'}, CHAT_ID={'set' if CHAT_ID else 'missing'}")
        return False

    try:
        _send_telegram_message(
            "\U0001f535 <b>AFI Bot Test</b>\n\n"
            "Telegram integration is working.\n"
            "You will receive alerts when new SEC filings are detected.",
            parse_mode="HTML",
        )
        logger.info("Test message sent successfully")
        return True
    except Exception as e:
        logger.error(f"Test message failed: {e}")
        return False


if __name__ == "__main__":
    send_test_message()
