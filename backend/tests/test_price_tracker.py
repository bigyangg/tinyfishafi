"""Tests for price_tracker.py — Scheduled check scheduling and status."""
import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone, timedelta
from price_tracker import PriceTracker


class TestScheduleChecks:
    """Test price correlation row creation."""

    def test_schedule_creates_row(self):
        mock_supabase = MagicMock()
        mock_supabase.table.return_value.insert.return_value.execute.return_value = MagicMock()
        
        tracker = PriceTracker(mock_supabase)
        tracker.schedule_checks(
            signal_id="test-uuid",
            ticker="AAPL",
            filed_at="2026-03-11T12:00:00+00:00",
            price_at_filing=150.0,
        )
        
        # Verify insert was called
        mock_supabase.table.assert_called_with("price_correlations")
        insert_call = mock_supabase.table.return_value.insert
        assert insert_call.called
        
        row = insert_call.call_args[0][0]
        assert row["signal_id"] == "test-uuid"
        assert row["ticker"] == "AAPL"
        assert row["price_at_filing"] == 150.0
        assert "check_1h_at" in row
        assert "check_24h_at" in row
        assert "check_3d_at" in row

    def test_schedule_skips_unknown_ticker(self):
        mock_supabase = MagicMock()
        tracker = PriceTracker(mock_supabase)
        tracker.schedule_checks("test-uuid", "UNKNOWN", "2026-03-11")
        mock_supabase.table.assert_not_called()

    def test_schedule_skips_empty_ticker(self):
        mock_supabase = MagicMock()
        tracker = PriceTracker(mock_supabase)
        tracker.schedule_checks("test-uuid", "", "2026-03-11")
        mock_supabase.table.assert_not_called()

    def test_schedule_handles_datetime_without_tz(self):
        mock_supabase = MagicMock()
        mock_supabase.table.return_value.insert.return_value.execute.return_value = MagicMock()
        
        tracker = PriceTracker(mock_supabase)
        tracker.schedule_checks(
            signal_id="test-uuid",
            ticker="AAPL",
            filed_at="2026-03-11",
            price_at_filing=150.0,
        )
        
        # Should not raise
        assert mock_supabase.table.return_value.insert.called

    def test_check_timestamps_are_future(self):
        mock_supabase = MagicMock()
        mock_supabase.table.return_value.insert.return_value.execute.return_value = MagicMock()
        
        tracker = PriceTracker(mock_supabase)
        now = datetime.now(timezone.utc)
        tracker.schedule_checks(
            signal_id="test-uuid",
            ticker="AAPL",
            filed_at=now.isoformat(),
            price_at_filing=150.0,
        )
        
        row = mock_supabase.table.return_value.insert.call_args[0][0]
        check_1h = datetime.fromisoformat(row["check_1h_at"])
        assert check_1h > now


class TestPriceTrackerStatus:
    def test_status_when_stopped(self):
        tracker = PriceTracker(MagicMock())
        status = tracker.get_status()
        assert status["running"] is False

    def test_status_includes_interval(self):
        tracker = PriceTracker(MagicMock())
        status = tracker.get_status()
        assert "check_interval" in status
        assert status["check_interval"] > 0
