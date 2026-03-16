# agents/social_agent.py
# Purpose: Reddit + StockTwits sentiment — detect retail vs smart money divergence
# Input: ticker
# Returns: {"reddit_sentiment": float, "stocktwits_sentiment": float, "volume_spike": bool, "social_vs_filing_delta": str}
# Env vars: TINYFISH_API_KEY

import asyncio
from .base_agent import BaseAgent


class SocialSentimentAgent(BaseAgent):
    name = "social"
    timeout_seconds = 15

    async def run(self, ticker: str = "") -> dict:
        if not ticker:
            return {}

        reddit_url = f"https://www.reddit.com/search/?q={ticker}&sort=new&t=day"
        stocktwits_url = f"https://stocktwits.com/symbol/{ticker}"

        reddit_task = f"""Navigate to {reddit_url}
Extract post titles and top comments mentioning {ticker}.
Focus on last 24 hours. Calculate overall sentiment -1.0 to +1.0.
Return JSON: {{"sentiment": 0.0, "post_count": 0, "top_posts": []}}"""

        stocktwits_task = f"""Navigate to {stocktwits_url}
Extract last 20 messages. Count bullish vs bearish tags.
Calculate sentiment -1.0 to +1.0.
Return JSON: {{"sentiment": 0.0, "bullish_count": 0, "bearish_count": 0, "volume_spike": false}}"""

        reddit_result, stocktwits_result = await asyncio.gather(
            self.call_tinyfish(reddit_task, reddit_url),
            self.call_tinyfish(stocktwits_task, stocktwits_url),
            return_exceptions=True,
        )

        reddit = reddit_result if isinstance(reddit_result, dict) else {}
        stocktwits = stocktwits_result if isinstance(stocktwits_result, dict) else {}

        r_sent = float(reddit.get("sentiment", 0.0))
        s_sent = float(stocktwits.get("sentiment", 0.0))
        volume_spike = stocktwits.get("volume_spike", False)

        delta = abs(r_sent - s_sent)
        if delta > 0.4:
            social_delta = "CONFLICTING"
        elif r_sent > 0.2 and s_sent > 0.2:
            social_delta = "ALIGNED_BULLISH"
        elif r_sent < -0.2 and s_sent < -0.2:
            social_delta = "ALIGNED_BEARISH"
        else:
            social_delta = "NEUTRAL"

        return {
            "reddit_sentiment": r_sent,
            "stocktwits_sentiment": s_sent,
            "volume_spike": volume_spike,
            "social_vs_filing_delta": social_delta,
        }
