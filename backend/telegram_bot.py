# telegram_bot.py — AFI Telegram Alert Bot
# Purpose: Send formatted signal alerts to Telegram when new filings are processed
# Dependencies: python-telegram-bot, httpx
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
    Send a formatted Telegram alert for a new signal.
    
    Args:
        signal_data: dict with keys: ticker, company, signal, summary, confidence, filed_at
    """
    if not TELEGRAM_ENABLED:
        logger.info("Telegram disabled — skipping alert")
        return

    # Do not send alerts for Pending signals
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
        ticker = signal_data.get("ticker", "UNKNOWN")
        company = signal_data.get("company", "Unknown")
        signal = signal_data.get("signal", "Neutral")
        summary = signal_data.get("summary", "")
        confidence = signal_data.get("confidence", 0)
        filed_at = signal_data.get("filed_at", "")

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

        message = (
            f"\U0001f535 AFI ALERT\n"
            f"\n"
            f"{ticker} \u2014 8-K Filing\n"
            f"Signal: {emoji} {signal}\n"
            f"{summary}\n"
            f"\n"
            f"Confidence: {confidence}% | {date_str}\n"
            f"\U0001f517 View on AFI Dashboard"
        )

        _send_telegram_message(message)
        logger.info(f"Telegram alert sent for {ticker} ({signal})")

    except Exception as e:
        logger.error(f"Failed to send Telegram alert: {e}")
        # Never crash the agent on Telegram failure


def _send_telegram_message(text):
    """Send a message via Telegram Bot API using httpx (sync)."""
    try:
        import httpx
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": CHAT_ID,
            "text": text,
            "parse_mode": None,  # Plain text to avoid parsing issues
        }
        with httpx.Client(timeout=10) as client:
            response = client.post(url, json=payload)
            if response.status_code != 200:
                logger.warning(f"Telegram API returned {response.status_code}: {response.text}")
    except Exception as e:
        logger.error(f"Telegram HTTP request failed: {e}")
        # Never crash — swallow the exception


def send_test_message():
    """Send a test message to verify Telegram bot configuration."""
    if not TELEGRAM_ENABLED:
        print("Telegram is disabled (TELEGRAM_ENABLED=false)")
        return False

    if not BOT_TOKEN or not CHAT_ID:
        print(f"Missing config: BOT_TOKEN={'set' if BOT_TOKEN else 'missing'}, CHAT_ID={'set' if CHAT_ID else 'missing'}")
        return False

    _send_telegram_message(
        "\U0001f535 AFI Bot Test\n\n"
        "Telegram integration is working.\n"
        "You will receive alerts when new SEC filings are detected."
    )
    print("Test message sent!")
    return True


if __name__ == "__main__":
    send_test_message()
