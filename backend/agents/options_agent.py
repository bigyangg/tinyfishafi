# agents/options_agent.py
# Purpose: Detect unusual options volume around filing time.
# Unusual = volume > 3x open interest on any strike.
# Input: ticker, filing_date (optional)
# Returns: put_call_ratio, unusual strike counts, options_sentiment

import logging
from .base_agent import BaseAgent

logger = logging.getLogger(__name__)


class OptionsActivityAgent(BaseAgent):
    """Detect unusual options activity around filing time"""

    name = "options"
    timeout_seconds = 12

    async def run(self, ticker: str = "", filing_date: str = None, **kwargs) -> dict:
        if not ticker:
            return {}
        try:
            import yfinance as yf
            stock = yf.Ticker(ticker)
            options_dates = stock.options
            if not options_dates:
                return {}

            # Get nearest expiry options chain
            nearest = options_dates[0]
            chain = stock.option_chain(nearest)
            calls = chain.calls
            puts = chain.puts

            # Flag unusual: volume > 3x open interest
            unusual_calls = calls[
                (calls['volume'] > calls['openInterest'] * 3) &
                (calls['volume'] > 100)  # minimum volume threshold
            ]
            unusual_puts = puts[
                (puts['volume'] > puts['openInterest'] * 3) &
                (puts['volume'] > 100)
            ]

            total_call_volume = int(calls['volume'].fillna(0).sum())
            total_put_volume = int(puts['volume'].fillna(0).sum())
            put_call_ratio = round(total_put_volume / max(total_call_volume, 1), 2)

            # Classify sentiment from options
            options_sentiment = "neutral"
            if put_call_ratio > 1.5:
                options_sentiment = "bearish"
            elif put_call_ratio < 0.5:
                options_sentiment = "bullish"

            result = {
                "put_call_ratio": put_call_ratio,
                "unusual_calls_count": len(unusual_calls),
                "unusual_puts_count": len(unusual_puts),
                "total_call_volume": total_call_volume,
                "total_put_volume": total_put_volume,
                "options_sentiment": options_sentiment,
                "expiry_date": nearest,
                "has_unusual_activity": len(unusual_calls) > 0 or len(unusual_puts) > 0,
            }

            # Include top unusual strikes if found
            if len(unusual_calls) > 0:
                top_call = unusual_calls.nlargest(1, 'volume').iloc[0]
                result["top_unusual_call"] = {
                    "strike": float(top_call.get('strike', 0)),
                    "volume": int(top_call.get('volume', 0)),
                    "open_interest": int(top_call.get('openInterest', 0)),
                }
            if len(unusual_puts) > 0:
                top_put = unusual_puts.nlargest(1, 'volume').iloc[0]
                result["top_unusual_put"] = {
                    "strike": float(top_put.get('strike', 0)),
                    "volume": int(top_put.get('volume', 0)),
                    "open_interest": int(top_put.get('openInterest', 0)),
                }

            return result

        except Exception as e:
            logger.warning(f"Options activity agent failed for {ticker}: {e}")
            return {}
