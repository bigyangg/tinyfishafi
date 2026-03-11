# impact_engine.py — Rule-Based Composite Impact Scoring
# Purpose: Calculate a 0-100 impact score from confidence, event type,
#          sentiment delta, and watchlist membership
# Dependencies: None (pure logic)

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Event type weights (0-100 scale, how impactful this event type typically is)
EVENT_WEIGHTS = {
    "GOING_CONCERN":     95,
    "RESTATEMENT":       90,
    "SEC_INVESTIGATION": 85,
    "EARNINGS_BEAT":     80,
    "EARNINGS_MISS":     80,
    "ACQUISITION":       75,
    "EXEC_DEPARTURE":    70,
    "GUIDANCE_RAISE":    70,
    "GUIDANCE_CUT":      70,
    "LITIGATION":        65,
    "CONTRACT_WIN":      65,
    "DEBT_ISSUE":        60,
    "BUYBACK":           55,
    "DIVIDEND":          50,
    "LEADERSHIP_HIRE":   50,
    "ROUTINE_ADMIN":     15,
}

# Default weight for unknown event types
DEFAULT_EVENT_WEIGHT = 40


def calculate_impact(
    event_type: str,
    confidence: int,
    sentiment_delta: float = 0.0,
    is_watchlist: bool = False,
) -> int:
    """
    Calculate composite impact score (0-100).
    
    Formula:
        impact = (0.40 * confidence) 
               + (0.30 * event_weight) 
               + (0.20 * sentiment_factor) 
               + (0.10 * watchlist_boost)
    
    Args:
        event_type: Taxonomy event type (e.g. "EARNINGS_BEAT")
        confidence: AI classification confidence (0-100)
        sentiment_delta: Sentiment conflict score (0.0-1.0, lower = more aligned)
        is_watchlist: Whether the ticker is on the user's watchlist
    
    Returns:
        Integer impact score 0-100
    """
    # Component 1: Confidence (40% weight)
    confidence_score = max(0, min(100, confidence))
    
    # Component 2: Event type importance (30% weight)
    event_weight = EVENT_WEIGHTS.get(event_type, DEFAULT_EVENT_WEIGHT)
    
    # Component 3: Sentiment alignment (20% weight)
    # Low delta (aligned sentiment) = high score
    # High delta (conflicting) = higher score (more interesting signal)
    # Conflicting signals are actually MORE important to flag
    if sentiment_delta > 0.5:
        # Strong conflict — this is notable
        sentiment_factor = 90
    elif sentiment_delta > 0.2:
        # Mild conflict
        sentiment_factor = 70
    else:
        # Aligned or neutral
        sentiment_factor = 50
    
    # Component 4: Watchlist boost (10% weight)
    watchlist_boost = 100 if is_watchlist else 0
    
    # Weighted composite
    raw_score = (
        0.40 * confidence_score
        + 0.30 * event_weight
        + 0.20 * sentiment_factor
        + 0.10 * watchlist_boost
    )
    
    impact = int(round(max(0, min(100, raw_score))))
    
    logger.debug(
        f"[IMPACT] {event_type}: conf={confidence_score}, "
        f"event={event_weight}, sent={sentiment_factor}, "
        f"wl={watchlist_boost} => {impact}"
    )
    
    return impact


def should_alert(impact_score: int, threshold: int = 60) -> bool:
    """Determine if a signal should trigger an alert based on impact score."""
    return impact_score >= threshold


def get_impact_label(impact_score: int) -> str:
    """Human-readable impact label."""
    if impact_score >= 80:
        return "Critical"
    elif impact_score >= 60:
        return "High"
    elif impact_score >= 40:
        return "Medium"
    elif impact_score >= 20:
        return "Low"
    return "Minimal"
