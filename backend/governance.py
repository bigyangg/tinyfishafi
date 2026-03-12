# governance.py — Signal Governance Layer
# Purpose: 5 validation checks on every signal before storage
# Produces a full audit trail for transparency

import logging
from typing import Optional

logger = logging.getLogger(__name__)


def run_governance(
    signal_data: dict,
    news_data: Optional[dict] = None,
) -> tuple[dict, list[dict]]:
    """
    Run 5 governance checks on a signal.

    Args:
        signal_data: dict with keys: signal, confidence, event_type, summary, key_facts
        news_data: optional dict with keys: news_sentiment, sentiment_match

    Returns:
        (modified_signal_data, audit_trail)
        - modified_signal_data has any adjustments applied
        - audit_trail is a list of check result dicts
    """
    audit = []
    data = dict(signal_data)  # Don't mutate original
    news = news_data or {}

    # ── CHECK 1: CONFIDENCE FLOOR ──
    confidence = data.get("confidence", 0)
    if confidence >= 20:
        audit.append({
            "check": "CONFIDENCE_FLOOR",
            "passed": True,
            "reason": f"Confidence {confidence} meets minimum threshold (20)",
            "action": "none",
        })
    else:
        audit.append({
            "check": "CONFIDENCE_FLOOR",
            "passed": False,
            "reason": f"Confidence {confidence} below minimum threshold (20)",
            "action": "event_type downgraded to ROUTINE_ADMIN",
        })
        data["event_type"] = "ROUTINE_ADMIN"
        logger.info(f"[GOVERNANCE] CHECK 1 FAILED: confidence {confidence} < 20, downgrading to ROUTINE_ADMIN")

    # ── CHECK 2: NEWS DIVERGENCE ──
    filing_signal = data.get("signal", "Neutral")
    news_sentiment = news.get("news_sentiment")
    sentiment_match = news.get("sentiment_match")

    if news_sentiment is None or sentiment_match is None:
        audit.append({
            "check": "NEWS_DIVERGENCE",
            "passed": True,
            "reason": "No news data available — skipping divergence check",
            "action": "none",
        })
    elif sentiment_match:
        audit.append({
            "check": "NEWS_DIVERGENCE",
            "passed": True,
            "reason": f"News sentiment agrees with filing signal ({filing_signal})",
            "action": "none",
        })
    else:
        penalty = 15
        data["confidence"] = max(0, data.get("confidence", 0) - penalty)
        data["divergence_type"] = f"Filing={filing_signal}, News={news_sentiment}"
        audit.append({
            "check": "NEWS_DIVERGENCE",
            "passed": False,
            "reason": f"Filing says {filing_signal} but news sentiment says {news_sentiment}",
            "action": f"confidence reduced by {penalty}",
        })
        logger.info(f"[GOVERNANCE] CHECK 2 FAILED: divergence detected, confidence reduced by {penalty}")

    # ── CHECK 3: KEY FACTS PRESENT ──
    key_facts = data.get("key_facts", [])
    if key_facts and len(key_facts) >= 1:
        audit.append({
            "check": "KEY_FACTS_PRESENT",
            "passed": True,
            "reason": f"{len(key_facts)} key fact(s) extracted",
            "action": "none",
        })
    else:
        audit.append({
            "check": "KEY_FACTS_PRESENT",
            "passed": False,
            "reason": "No key facts extracted from filing",
            "action": "impact score will be reduced",
        })
        # Flag for impact engine to penalize
        data["_no_key_facts"] = True
        logger.info("[GOVERNANCE] CHECK 3 FAILED: no key facts extracted")

    # ── CHECK 4: EVENT-SIGNAL CONSISTENCY ──
    event_type = data.get("event_type", "")
    signal = data.get("signal", "Neutral")

    positive_events = {"EARNINGS_BEAT", "GUIDANCE_RAISE", "CONTRACT_WIN", "BUYBACK", "DIVIDEND", "INSIDER_BUY", "LEADERSHIP_HIRE"}
    risk_events = {"EARNINGS_MISS", "GUIDANCE_CUT", "GOING_CONCERN", "RESTATEMENT", "SEC_INVESTIGATION", "LITIGATION", "INSIDER_SELL", "EXEC_DEPARTURE"}

    is_consistent = True
    if signal == "Positive" and event_type in risk_events:
        is_consistent = False
    elif signal == "Risk" and event_type in positive_events:
        is_consistent = False

    if is_consistent:
        audit.append({
            "check": "EVENT_SIGNAL_CONSISTENCY",
            "passed": True,
            "reason": f"Signal ({signal}) is consistent with event type ({event_type})",
            "action": "none",
        })
    else:
        audit.append({
            "check": "EVENT_SIGNAL_CONSISTENCY",
            "passed": False,
            "reason": f"Signal ({signal}) conflicts with event type ({event_type})",
            "action": "flagged for review",
        })
        data["_inconsistency_flag"] = True
        logger.info(f"[GOVERNANCE] CHECK 4 FAILED: {signal} conflicts with {event_type}")

    # ── CHECK 5: JUNK FILTER ──
    summary = data.get("summary", "")
    junk_patterns = [
        "no matching ticker", "not an 8-k filing", "no filing content",
        "system message", "cannot analyze", "unable to provide",
        "provided text indicates", "ai classification failed",
        "agent is analyzing", "processing filing", "i cannot",
        "as an ai", "no information", "filing does not",
    ]
    summary_lower = summary.lower()
    is_junk = any(p in summary_lower for p in junk_patterns)

    if not is_junk and len(summary.strip()) > 10:
        audit.append({
            "check": "JUNK_FILTER",
            "passed": True,
            "reason": "Summary is valid content",
            "action": "none",
        })
    else:
        audit.append({
            "check": "JUNK_FILTER",
            "passed": False,
            "reason": f"Summary flagged as junk: '{summary[:60]}'",
            "action": "REJECT — signal will not be stored",
        })
        data["_rejected"] = True
        logger.info(f"[GOVERNANCE] CHECK 5 FAILED: junk summary detected")

    passed_count = sum(1 for a in audit if a["passed"])
    logger.info(f"[GOVERNANCE] {passed_count}/5 checks passed")

    return data, audit
