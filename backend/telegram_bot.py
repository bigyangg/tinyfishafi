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

# Event type labels for human-readable messages
EVENT_LABELS = {
    "EARNINGS_BEAT":      "Earnings Beat",
    "EARNINGS_MISS":      "Earnings Miss",
    "EXEC_DEPARTURE":     "Executive Departure",
    "EXEC_APPOINTMENT":   "New Executive",
    "MERGER_ACQUISITION": "M&A Activity",
    "LEGAL_REGULATORY":   "Legal/Regulatory",
    "DEBT_FINANCING":     "Debt/Financing",
    "MATERIAL_EVENT":     "Material Event",
    "DIVIDEND":           "Dividend Change",
    "ROUTINE_ADMIN":      "Administrative",
}


def should_send_telegram(signal_data: dict, watchlist_tickers: list = None) -> bool:
    """
    Smart threshold logic — decides if a signal warrants a Telegram alert.
    Always alerts for watchlist tickers; uses confidence + impact for others.
    """
    if not TELEGRAM_ENABLED:
        return False
    if not BOT_TOKEN or not CHAT_ID:
        return False

    ticker     = signal_data.get("ticker", "")
    signal     = signal_data.get("signal", "Neutral")
    confidence = signal_data.get("confidence", 0) or 0
    impact     = signal_data.get("impact_score", 0) or 0
    event_type = signal_data.get("event_type", "")

    # Never alert for Pending signals
    if signal == "Pending":
        return False

    # ALWAYS alert for watchlist tickers (regardless of score)
    if watchlist_tickers and ticker in watchlist_tickers:
        return True

    # ALWAYS alert for high-confidence non-routine events
    if event_type not in ("ROUTINE_ADMIN", None, "") and confidence >= 70:
        return True

    # Alert for Positive/Risk signals with decent confidence
    if signal in ("Positive", "Risk") and confidence >= 60:
        return True

    # Alert for high impact scores
    if impact >= 55:
        return True

    return False


def send_signal_alert(signal_data, is_watched=False):
    """
    Send a rich, actionable Telegram alert for a new signal using HTML parse mode.

    Args:
        signal_data: dict with keys: ticker, company, signal, summary, confidence, filed_at, etc.
        is_watched: bool — whether this ticker is on any user's watchlist
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
        event_label = EVENT_LABELS.get(event_type, event_type or "8-K Filing")

        # Build SEC EDGAR URL
        edgar_url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={ticker}&type=8-K&dateb=&owner=include&count=5"

        # Watched ticker indicator
        watched_line = "\u2b50 <b>WATCHED TICKER</b>\n\n" if is_watched else ""

        # Event + impact line
        enrichment = ""
        if event_type:
            enrichment += f"\nEvent: {_escape_html(event_label)}"
        if impact_score is not None:
            enrichment += f" | Impact: <code>{impact_score}/100</code>"

        message = (
            f"{watched_line}"
            f"\U0001f514 <b>AFI ALERT</b>\n\n"
            f"<b>{ticker}</b> \u2014 {filing_type}\n"
            f"{_escape_html(company)}\n\n"
            f"Signal: {emoji} <b>{signal}</b>\n"
            f"{summary}\n\n"
            f"Confidence: <code>{confidence}%</code> | {date_str}"
            f"{enrichment}\n\n"
            f'<a href="{edgar_url}">View on SEC EDGAR</a>'
        )

        _send_telegram_message(message, parse_mode="HTML")
        logger.info(f"Telegram alert sent for {ticker} ({signal}, impact={impact_score})")

    except Exception as e:
        logger.error(f"Failed to send Telegram alert: {e}")
        # Never crash the agent on Telegram failure


import html

def _escape_html(text):
    """Escape special HTML characters to prevent parse errors. Unescapes first to avoid double-escaping (&amp;amp;)."""
    if not text:
        return ""
    text = html.unescape(str(text))
    return (
        text
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
            "disable_web_page_preview": True,
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
            "\U0001f514 <b>AFI Bot Test</b>\n\n"
            "Telegram integration is working.\n"
            "You will receive alerts when new SEC filings are detected.\n\n"
            "Alert triggers:\n"
            "\u2022 Watchlist tickers (always)\n"
            "\u2022 High-confidence non-routine events (\u226570%)\n"
            "\u2022 Positive/Risk signals (\u226560% confidence)\n"
            "\u2022 High impact scores (\u226555/100)",
            parse_mode="HTML",
        )
        logger.info("Test message sent successfully")
        return True
    except Exception as e:
        logger.error(f"Test message failed: {e}")
        return False


if __name__ == "__main__":
    send_test_message()
