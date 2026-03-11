# event_classifier.py — Deterministic Event Taxonomy Mapper
# Purpose: Maps Gemini's free-text classification into a fixed event taxonomy
#          and extracts 8-K item numbers for filing subtype. No API calls.
# Dependencies: re (stdlib only)

import re
from dataclasses import dataclass
from typing import Optional


@dataclass
class EventClassification:
    """Result of deterministic event classification."""
    event_type: str           # e.g. "EARNINGS_BEAT", "EXEC_DEPARTURE"
    filing_subtype: str       # e.g. "8-K Item 2.02"
    signal: str               # "Positive" / "Neutral" / "Risk"
    confidence_adjustment: int # Modifier to apply to base confidence (-20 to +20)


# Fixed event taxonomy — each event type has a default signal and base confidence
EVENT_TAXONOMY = {
    "EARNINGS_BEAT":      {"signal": "Positive", "weight": 85, "keywords": ["revenue beat", "earnings beat", "exceeded expectations", "beat estimates", "revenue growth", "earnings growth", "profit increase"]},
    "EARNINGS_MISS":      {"signal": "Risk",     "weight": 80, "keywords": ["revenue miss", "earnings miss", "below expectations", "missed estimates", "revenue decline", "earnings decline", "profit decrease"]},
    "CONTRACT_WIN":       {"signal": "Positive", "weight": 70, "keywords": ["new contract", "awarded contract", "partnership", "agreement signed", "deal signed", "strategic alliance"]},
    "BUYBACK":            {"signal": "Positive", "weight": 65, "keywords": ["buyback", "share repurchase", "stock repurchase", "repurchase program"]},
    "DIVIDEND":           {"signal": "Positive", "weight": 60, "keywords": ["dividend increase", "special dividend", "dividend declared", "dividend raise"]},
    "LEADERSHIP_HIRE":    {"signal": "Positive", "weight": 60, "keywords": ["new ceo", "new cfo", "appointed", "named as", "leadership upgrade", "hired as", "new president"]},
    "ACQUISITION":        {"signal": "Positive", "weight": 75, "keywords": ["acquisition", "acquired", "merger", "to acquire", "definitive agreement to purchase"]},
    "EXEC_DEPARTURE":     {"signal": "Risk",     "weight": 75, "keywords": ["departure", "resigned", "resignation", "stepping down", "terminated", "ceo left", "cfo left", "executive departure"]},
    "LITIGATION":         {"signal": "Risk",     "weight": 70, "keywords": ["litigation", "lawsuit", "legal proceedings", "sued", "complaint filed", "settlement", "regulatory action"]},
    "DEBT_ISSUE":         {"signal": "Risk",     "weight": 65, "keywords": ["debt", "credit facility", "loan agreement", "borrowing", "refinancing", "bond offering", "notes offering"]},
    "RESTATEMENT":        {"signal": "Risk",     "weight": 85, "keywords": ["restatement", "restated", "accounting error", "material weakness", "internal control"]},
    "GOING_CONCERN":      {"signal": "Risk",     "weight": 90, "keywords": ["going concern", "doubt about ability to continue", "substantial doubt", "liquidity concern"]},
    "SEC_INVESTIGATION":  {"signal": "Risk",     "weight": 85, "keywords": ["sec investigation", "sec inquiry", "subpoena", "wells notice", "enforcement action"]},
    "GUIDANCE_RAISE":     {"signal": "Positive", "weight": 75, "keywords": ["raised guidance", "increased guidance", "raised outlook", "upward revision", "raised forecast"]},
    "GUIDANCE_CUT":       {"signal": "Risk",     "weight": 75, "keywords": ["lowered guidance", "cut guidance", "reduced outlook", "downward revision", "lowered forecast"]},
    "ROUTINE_ADMIN":      {"signal": "Neutral",  "weight": 30, "keywords": ["routine", "administrative", "bylaw amendment", "board committee", "annual meeting"]},
}

# 8-K item number to human-readable description
ITEM_8K_MAP = {
    "1.01": "Entry into Material Agreement",
    "1.02": "Termination of Material Agreement",
    "1.03": "Bankruptcy or Receivership",
    "2.01": "Completion of Acquisition/Disposition",
    "2.02": "Results of Operations (Earnings)",
    "2.03": "Creation of Direct Financial Obligation",
    "2.04": "Triggering Events — Acceleration of Obligation",
    "2.05": "Costs for Exit/Disposal Activities",
    "2.06": "Material Impairments",
    "3.01": "Delisting or Transfer Failure",
    "3.02": "Unregistered Sales of Equity Securities",
    "3.03": "Material Modification to Rights of Holders",
    "4.01": "Changes in Registrant's Certifying Accountant",
    "4.02": "Non-Reliance on Financial Statements",
    "5.01": "Changes in Control of Registrant",
    "5.02": "Departure/Election of Directors or Officers",
    "5.03": "Amendments to Articles/Bylaws",
    "5.05": "Amendments to Code of Ethics",
    "5.07": "Submission to Vote of Security Holders",
    "7.01": "Regulation FD Disclosure",
    "8.01": "Other Events",
    "9.01": "Financial Statements and Exhibits",
}

# Item numbers mapped to likely event types for confidence boosting
ITEM_EVENT_HINTS = {
    "2.02": "EARNINGS_BEAT",  # Could also be EARNINGS_MISS — signal from Gemini clarifies
    "5.02": "EXEC_DEPARTURE", # Could also be LEADERSHIP_HIRE
    "1.01": "CONTRACT_WIN",   # Could also be DEBT_ISSUE — context dependent
    "1.03": "GOING_CONCERN",
    "2.01": "ACQUISITION",
    "4.02": "RESTATEMENT",
    "2.06": "RESTATEMENT",
}


def classify_event(
    gemini_summary: str,
    gemini_signal: str,
    filing_text: Optional[str] = None,
    filing_type: str = "8-K"
) -> EventClassification:
    """
    Map Gemini's free-text output into a fixed event taxonomy.
    
    This is deterministic — no API calls. Uses keyword matching on
    the Gemini summary to find the best event type match.
    
    Args:
        gemini_summary: One-sentence summary from Gemini classification
        gemini_signal: "Positive" / "Neutral" / "Risk" from Gemini
        filing_text: Optional raw filing text for 8-K item extraction
        filing_type: Filing type (currently only "8-K" supported)
    
    Returns:
        EventClassification with event_type, filing_subtype, validated signal,
        and confidence adjustment
    """
    summary_lower = gemini_summary.lower()
    
    # Step 1: Extract 8-K item numbers from filing text
    items_found = _extract_8k_items(filing_text) if filing_text and filing_type == "8-K" else []
    filing_subtype = f"8-K Item {items_found[0]}" if items_found else "8-K"
    
    # Step 2: Score each event type by keyword match count
    scores: dict[str, int] = {}
    for event_type, meta in EVENT_TAXONOMY.items():
        score = 0
        for keyword in meta["keywords"]:
            if keyword in summary_lower:
                score += 1
        if score > 0:
            scores[event_type] = score
    
    # Step 3: Boost score if 8-K item number hints at an event type
    for item in items_found:
        if item in ITEM_EVENT_HINTS:
            hinted = ITEM_EVENT_HINTS[item]
            scores[hinted] = scores.get(hinted, 0) + 2  # Strong boost
    
    # Step 4: Pick best match, fall back to ROUTINE_ADMIN
    if scores:
        best_event = max(scores, key=scores.get)
    else:
        best_event = "ROUTINE_ADMIN"
    
    event_meta = EVENT_TAXONOMY[best_event]
    
    # Step 5: Validate signal — if Gemini and taxonomy disagree, trust Gemini
    # but apply a confidence penalty
    confidence_adj = 0
    final_signal = gemini_signal if gemini_signal in ("Positive", "Neutral", "Risk") else event_meta["signal"]
    
    if gemini_signal != event_meta["signal"] and gemini_signal in ("Positive", "Neutral", "Risk"):
        # Gemini says something different than our taxonomy default
        # Trust Gemini but penalize confidence slightly
        confidence_adj = -10
    
    # Bonus: if item number and event type align, boost confidence
    for item in items_found:
        if item in ITEM_EVENT_HINTS and ITEM_EVENT_HINTS[item] == best_event:
            confidence_adj += 5
            break
    
    return EventClassification(
        event_type=best_event,
        filing_subtype=filing_subtype,
        signal=final_signal,
        confidence_adjustment=max(-20, min(20, confidence_adj)),
    )


def _extract_8k_items(text: str) -> list[str]:
    """
    Extract 8-K item numbers from filing text.
    
    Looks for patterns like "Item 2.02", "ITEM 5.02", etc.
    Returns sorted unique list of item numbers.
    """
    if not text:
        return []
    
    # Match "Item X.XX" patterns
    pattern = r'(?:item|ITEM)\s+(\d+\.\d{2})'
    matches = re.findall(pattern, text, re.IGNORECASE)
    
    # Dedupe and validate against known items
    valid_items = []
    seen = set()
    for item in matches:
        if item in ITEM_8K_MAP and item not in seen:
            valid_items.append(item)
            seen.add(item)
    
    return sorted(valid_items)


def get_item_description(item_number: str) -> str:
    """Get human-readable description for an 8-K item number."""
    return ITEM_8K_MAP.get(item_number, "Unknown Item")
