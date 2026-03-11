# sentiment_analyzer.py — Filing Signal vs News Tone Comparison
# Purpose: Option A sentiment delta — does the filing signal match current news tone?
# Dependencies: None (keyword-based scoring, no AI calls)
# Performance: ~1ms execution time

import logging
import re
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class SentimentResult:
    """Result of sentiment analysis."""
    sentiment_delta: float       # -1.0 to 1.0 (0 = aligned, >0 = conflicting)
    news_sentiment_score: float  # -1.0 (very negative) to 1.0 (very positive)
    sentiment_match: bool        # True if filing signal matches news tone


# Weighted keyword lists for news headline scoring
POSITIVE_KEYWORDS = {
    # Strong positive (weight 2)
    "surge": 2, "soar": 2, "record high": 2, "breakthrough": 2,
    "skyrocket": 2, "blockbuster": 2, "outperform": 2,
    # Medium positive (weight 1)
    "gain": 1, "rise": 1, "climb": 1, "grow": 1, "growth": 1,
    "upgrade": 1, "bullish": 1, "optimistic": 1, "beat": 1,
    "strong": 1, "rally": 1, "positive": 1, "exceed": 1,
    "profit": 1, "boost": 1, "recovery": 1, "upside": 1,
    "buy": 1, "outpace": 1, "momentum": 1,
}

NEGATIVE_KEYWORDS = {
    # Strong negative (weight 2)
    "crash": 2, "plunge": 2, "collapse": 2, "bankruptcy": 2,
    "fraud": 2, "scandal": 2, "catastrophe": 2, "default": 2,
    # Medium negative (weight 1)
    "fall": 1, "drop": 1, "decline": 1, "loss": 1, "lose": 1,
    "downgrade": 1, "bearish": 1, "pessimistic": 1, "miss": 1,
    "weak": 1, "selloff": 1, "sell-off": 1, "negative": 1,
    "risk": 1, "concern": 1, "warning": 1, "cut": 1,
    "lawsuit": 1, "investigation": 1, "layoff": 1, "layoffs": 1,
}


def analyze_sentiment(
    filing_signal: str,
    news_headlines: list[str],
) -> SentimentResult:
    """
    Compare filing signal against current news tone.
    
    Option A implementation:
    - Risk filing + negative news = confirmed (delta ~0)
    - Risk filing + positive news = conflicting (delta ~1)
    - Positive filing + positive news = confirmed (delta ~0)
    - Positive filing + negative news = conflicting (delta ~1)
    
    Args:
        filing_signal: "Positive" / "Neutral" / "Risk" from classification
        news_headlines: List of recent news headline strings
    
    Returns:
        SentimentResult with delta, news score, and match boolean
    """
    if not news_headlines:
        # No news data — return neutral, non-conflicting
        return SentimentResult(
            sentiment_delta=0.0,
            news_sentiment_score=0.0,
            sentiment_match=True,
        )
    
    # Score each headline
    total_score = 0.0
    for headline in news_headlines:
        total_score += _score_headline(headline)
    
    # Normalize to -1.0 to 1.0 range
    # Average per headline, then clamp
    avg_score = total_score / len(news_headlines)
    news_sentiment = max(-1.0, min(1.0, avg_score / 3.0))  # /3 to normalize weight range
    
    # Determine if filing signal matches news sentiment
    filing_direction = _signal_to_direction(filing_signal)
    news_direction = "positive" if news_sentiment > 0.1 else ("negative" if news_sentiment < -0.1 else "neutral")
    
    # Calculate delta
    if filing_signal == "Neutral":
        # Neutral filings always "match" — no conflict
        sentiment_delta = 0.0
        sentiment_match = True
    elif filing_direction == news_direction:
        # Aligned: both positive or both negative
        sentiment_delta = 0.0
        sentiment_match = True
    elif news_direction == "neutral":
        # News is neutral, filing has direction — mild non-match
        sentiment_delta = 0.3
        sentiment_match = True  # Close enough
    else:
        # Conflicting: positive vs negative
        sentiment_delta = abs(news_sentiment)  # Higher news strength = stronger conflict
        sentiment_match = False
    
    return SentimentResult(
        sentiment_delta=round(sentiment_delta, 3),
        news_sentiment_score=round(news_sentiment, 3),
        sentiment_match=sentiment_match,
    )


def _score_headline(headline: str) -> float:
    """Score a single headline using keyword matching."""
    text = headline.lower()
    score = 0.0
    
    for keyword, weight in POSITIVE_KEYWORDS.items():
        if keyword in text:
            score += weight
    
    for keyword, weight in NEGATIVE_KEYWORDS.items():
        if keyword in text:
            score -= weight
    
    return score


def _signal_to_direction(signal: str) -> str:
    """Convert filing signal to sentiment direction."""
    if signal == "Positive":
        return "positive"
    elif signal == "Risk":
        return "negative"
    return "neutral"
