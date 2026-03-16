# agents/news_agent.py
# Purpose: Extract top 8 financial headlines from Yahoo Finance last 48h
# Input: ticker
# Returns: {"headlines": [], "sentiment_score": float, "dominant_theme": str}
# Env vars: TINYFISH_API_KEY

from .base_agent import BaseAgent


class NewsAgent(BaseAgent):
    name = "news"
    timeout_seconds = 15

    async def run(self, ticker: str = "") -> dict:
        if not ticker:
            return {}

        url = f"https://finance.yahoo.com/quote/{ticker}/news"
        task = f"""Navigate to {url}

Extract the top 8 news items from the last 48 hours only.
For each item extract: headline, source name, timestamp, first paragraph or summary.

Calculate an overall sentiment score from -1.0 (very negative) to +1.0 (very positive).
Identify the dominant theme (e.g. "regulatory_pressure", "earnings_beat", "product_launch", "legal_issues").

Return ONLY this JSON:
{{
  "headlines": [
    {{"headline": "...", "source": "...", "timestamp": "...", "summary": "..."}}
  ],
  "sentiment_score": 0.0,
  "dominant_theme": "general"
}}"""

        return await self.call_tinyfish(task, url)
