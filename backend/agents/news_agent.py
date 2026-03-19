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


def process_news_results(articles: list, ticker: str) -> dict:
    """
    Extract structured news intelligence from raw articles.
    Used by enrichment_pipeline to process NewsAgent output.
    """
    if not articles:
        return {
            "theme": "No recent news",
            "sentiment": "neutral",
            "top_headlines": [],
            "news_dominant_theme": "",
            "news_sentiment": "neutral",
        }

    POSITIVE_WORDS = [
        "beat", "surged", "soared", "record", "growth",
        "partnership", "breakthrough", "wins", "strong",
        "raises", "upgraded", "bullish"
    ]
    NEGATIVE_WORDS = [
        "miss", "fell", "dropped", "loss", "risk",
        "concern", "investigation", "downgrade", "bearish",
        "cut", "decline", "warning", "recall", "fine"
    ]

    scores = []
    headlines = []
    themes = []

    for article in articles[:10]:
        title = article.get("title") or article.get("headline", "")
        if not title:
            continue

        t_lower = title.lower()
        pos = sum(1 for w in POSITIVE_WORDS if w in t_lower)
        neg = sum(1 for w in NEGATIVE_WORDS if w in t_lower)
        score = pos - neg
        scores.append(score)
        headlines.append({
            "title": title,
            "source": article.get("source") or article.get("publisher", {}).get("name", "") if isinstance(article.get("publisher"), dict) else article.get("publisher", ""),
            "url": article.get("url") or article.get("link", ""),
            "sentiment": "positive" if score > 0 else "negative" if score < 0 else "neutral",
            "published": article.get("published") or article.get("providerPublishTime", ""),
        })

        if any(w in t_lower for w in ["earnings","revenue","profit","eps"]):
            themes.append("earnings")
        elif any(w in t_lower for w in ["deal","merger","acqui","partner"]):
            themes.append("M&A")
        elif any(w in t_lower for w in ["lawsuit","sec","investigate","fine"]):
            themes.append("regulatory")
        elif any(w in t_lower for w in ["product","launch","release","new"]):
            themes.append("product")
        elif any(w in t_lower for w in ["exec","ceo","cfo","appoint","resign"]):
            themes.append("leadership")
        else:
            themes.append("general")

    avg_score = sum(scores) / max(len(scores), 1)
    dominant_theme = max(set(themes), key=themes.count) if themes else "general"
    overall_sentiment = "positive" if avg_score > 0.3 else "negative" if avg_score < -0.3 else "neutral"

    return {
        "theme": dominant_theme,
        "sentiment": overall_sentiment,
        "top_headlines": headlines[:3],
        "news_dominant_theme": dominant_theme,
        "news_sentiment": overall_sentiment,
        "news_score": round(avg_score, 2),
    }
