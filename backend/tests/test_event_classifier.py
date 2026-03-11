"""Tests for event_classifier.py — Deterministic taxonomy mapping and 8-K item extraction."""
import pytest
from event_classifier import classify_event, _extract_8k_items, get_item_description, EventClassification


class TestClassifyEvent:
    """Test event classification from Gemini output."""

    def test_earnings_beat_detected(self):
        result = classify_event(
            gemini_summary="Company reported revenue beat, exceeding expectations by 15%",
            gemini_signal="Positive",
        )
        assert result.event_type == "EARNINGS_BEAT"
        assert result.signal == "Positive"
        assert isinstance(result.confidence_adjustment, int)

    def test_exec_departure_detected(self):
        result = classify_event(
            gemini_summary="CEO resigned effective immediately, board searching for replacement",
            gemini_signal="Risk",
        )
        assert result.event_type == "EXEC_DEPARTURE"
        assert result.signal == "Risk"

    def test_litigation_detected(self):
        result = classify_event(
            gemini_summary="Company faces lawsuit from shareholders over accounting practices",
            gemini_signal="Risk",
        )
        assert result.event_type == "LITIGATION"
        assert result.signal == "Risk"

    def test_buyback_detected(self):
        result = classify_event(
            gemini_summary="Board approved $2B share repurchase program",
            gemini_signal="Positive",
        )
        assert result.event_type == "BUYBACK"
        assert result.signal == "Positive"

    def test_going_concern_detected(self):
        result = classify_event(
            gemini_summary="Auditor expressed substantial doubt about ability to continue as going concern",
            gemini_signal="Risk",
        )
        assert result.event_type == "GOING_CONCERN"
        assert result.signal == "Risk"

    def test_routine_admin_fallback(self):
        result = classify_event(
            gemini_summary="Company filed routine quarterly document",
            gemini_signal="Neutral",
        )
        # "routine" matches ROUTINE_ADMIN
        assert result.event_type == "ROUTINE_ADMIN"
        assert result.signal == "Neutral"

    def test_unknown_summary_falls_back(self):
        result = classify_event(
            gemini_summary="Something completely unrecognizable happened",
            gemini_signal="Neutral",
        )
        assert result.event_type == "ROUTINE_ADMIN"

    def test_signal_disagreement_penalizes_confidence(self):
        # Gemini says Positive but taxonomy says Risk for this event type
        result = classify_event(
            gemini_summary="CEO resigned but market responded positively",
            gemini_signal="Positive",
        )
        # Should still trust Gemini's signal
        assert result.signal == "Positive"
        # But confidence should be penalized
        assert result.confidence_adjustment < 0

    def test_item_number_boosts_confidence(self):
        result = classify_event(
            gemini_summary="CEO departure announced",
            gemini_signal="Risk",
            filing_text="Item 5.02 - Departure of Directors or Certain Officers",
            filing_type="8-K",
        )
        assert result.filing_subtype == "8-K Item 5.02"
        assert result.confidence_adjustment > 0 or result.confidence_adjustment == 0

    def test_returns_valid_dataclass(self):
        result = classify_event("test summary", "Neutral")
        assert isinstance(result, EventClassification)
        assert hasattr(result, "event_type")
        assert hasattr(result, "filing_subtype")
        assert hasattr(result, "signal")
        assert hasattr(result, "confidence_adjustment")

    def test_confidence_adjustment_bounded(self):
        result = classify_event(
            gemini_summary="massive earnings beat revenue growth profit increase exceeded expectations",
            gemini_signal="Risk",  # Force disagreement
        )
        assert -20 <= result.confidence_adjustment <= 20


class TestExtract8KItems:
    """Test 8-K item number extraction from filing text."""

    def test_single_item(self):
        text = "Item 2.02 Results of Operations and Financial Condition"
        items = _extract_8k_items(text)
        assert "2.02" in items

    def test_multiple_items(self):
        text = "Item 5.02 Departure of Officers\nItem 9.01 Financial Statements"
        items = _extract_8k_items(text)
        assert "5.02" in items
        assert "9.01" in items

    def test_case_insensitive(self):
        text = "ITEM 2.02 RESULTS OF OPERATIONS"
        items = _extract_8k_items(text)
        assert "2.02" in items

    def test_no_items(self):
        text = "This is a plain filing with no item numbers"
        items = _extract_8k_items(text)
        assert items == []

    def test_empty_text(self):
        assert _extract_8k_items("") == []
        assert _extract_8k_items(None) == []

    def test_deduplicates(self):
        text = "Item 2.02 first mention\nItem 2.02 second mention"
        items = _extract_8k_items(text)
        assert items.count("2.02") == 1

    def test_ignores_invalid_items(self):
        text = "Item 99.99 Not a real item"
        items = _extract_8k_items(text)
        assert "99.99" not in items


class TestGetItemDescription:
    def test_known_item(self):
        desc = get_item_description("2.02")
        assert "Results of Operations" in desc or "Earnings" in desc

    def test_unknown_item(self):
        desc = get_item_description("99.99")
        assert desc == "Unknown Item"
