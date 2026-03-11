"""Tests for impact_engine.py — Composite impact scoring."""
import pytest
from impact_engine import calculate_impact, should_alert, get_impact_label


class TestCalculateImpact:
    """Test impact score calculation."""

    def test_high_impact_event(self):
        score = calculate_impact(
            event_type="GOING_CONCERN",
            confidence=90,
            sentiment_delta=0.0,
            is_watchlist=True,
        )
        assert score >= 70
        assert score <= 100

    def test_low_impact_routine(self):
        score = calculate_impact(
            event_type="ROUTINE_ADMIN",
            confidence=30,
            sentiment_delta=0.0,
            is_watchlist=False,
        )
        assert score <= 40

    def test_watchlist_boost(self):
        score_without = calculate_impact("EARNINGS_BEAT", 70, 0.0, is_watchlist=False)
        score_with = calculate_impact("EARNINGS_BEAT", 70, 0.0, is_watchlist=True)
        assert score_with > score_without
        assert score_with - score_without == 10  # 10% of 100

    def test_conflicting_sentiment_increases_score(self):
        score_aligned = calculate_impact("EARNINGS_BEAT", 70, 0.0)
        score_conflict = calculate_impact("EARNINGS_BEAT", 70, 0.8)
        assert score_conflict > score_aligned

    def test_score_bounded_0_100(self):
        # Minimum possible
        score_min = calculate_impact("ROUTINE_ADMIN", 0, 0.0, False)
        assert 0 <= score_min <= 100
        
        # Maximum possible
        score_max = calculate_impact("GOING_CONCERN", 100, 0.8, True)
        assert 0 <= score_max <= 100

    def test_unknown_event_type_uses_default(self):
        score = calculate_impact("UNKNOWN_EVENT", 50, 0.0)
        assert 0 <= score <= 100

    def test_returns_integer(self):
        score = calculate_impact("EARNINGS_BEAT", 75, 0.3)
        assert isinstance(score, int)


class TestShouldAlert:
    def test_above_threshold(self):
        assert should_alert(75) is True

    def test_below_threshold(self):
        assert should_alert(30) is False

    def test_at_threshold(self):
        assert should_alert(60) is True

    def test_custom_threshold(self):
        assert should_alert(50, threshold=40) is True
        assert should_alert(30, threshold=40) is False


class TestGetImpactLabel:
    def test_critical(self):
        assert get_impact_label(90) == "Critical"

    def test_high(self):
        assert get_impact_label(65) == "High"

    def test_medium(self):
        assert get_impact_label(45) == "Medium"

    def test_low(self):
        assert get_impact_label(25) == "Low"

    def test_minimal(self):
        assert get_impact_label(10) == "Minimal"
