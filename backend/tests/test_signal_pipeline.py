"""Tests for signal_pipeline.py — Pipeline orchestration and registry pattern."""
import pytest
from unittest.mock import MagicMock, patch
from signal_pipeline import (
    SignalPipeline, RawFiling, ProcessedSignal,
    FilingProcessor, EightKProcessor,
)


class MockProcessor(FilingProcessor):
    """Test processor that returns canned classification."""
    
    def __init__(self, result=None):
        self.result = result or {
            "ticker": "TEST",
            "company": "Test Corp",
            "summary": "Test revenue beat expectations",
            "signal": "Positive",
            "confidence": 80,
        }
    
    def classify(self, filing):
        return self.result


def make_raw_filing(**overrides):
    defaults = {
        "accession_number": "0001234-25-000001",
        "filing_type": "8-K",
        "company_name": "Test Corp",
        "entity_id": "12345",
        "filed_at": "2026-03-11",
        "filing_url": "https://sec.gov/test",
        "filing_text": "Test filing about revenue beat expectations Item 2.02",
    }
    defaults.update(overrides)
    return RawFiling(**defaults)


class TestPipelineRegistry:
    """Test filing processor registration."""

    def test_register_processor(self):
        pipeline = SignalPipeline(MagicMock())
        pipeline.register_processor("TEST", MockProcessor())
        assert "TEST" in pipeline._processors

    def test_default_8k_registered(self):
        pipeline = SignalPipeline(MagicMock())
        assert "8-K" in pipeline._processors
        assert isinstance(pipeline._processors["8-K"], EightKProcessor)

    def test_unregistered_type_returns_none(self):
        pipeline = SignalPipeline(MagicMock())
        filing = make_raw_filing(filing_type="S-1")
        result = pipeline.process(filing)
        assert result is None


class TestPipelineProcess:
    """Test end-to-end pipeline processing with mocked dependencies."""

    def test_process_returns_processed_signal(self):
        pipeline = SignalPipeline(MagicMock())
        pipeline.register_processor("8-K", MockProcessor())
        
        # Mock market data
        mock_mds = MagicMock()
        mock_mds.get_price.return_value = 150.0
        mock_mds.get_news_headlines.return_value = []
        pipeline._market_data = mock_mds
        
        filing = make_raw_filing()
        result = pipeline.process(filing)
        
        assert isinstance(result, ProcessedSignal)
        assert result.ticker == "TEST"
        assert result.signal == "Positive"
        assert result.confidence > 0

    def test_process_includes_enrichment(self):
        pipeline = SignalPipeline(MagicMock())
        pipeline.register_processor("8-K", MockProcessor())
        
        mock_mds = MagicMock()
        mock_mds.get_price.return_value = 150.0
        mock_mds.get_news_headlines.return_value = []
        pipeline._market_data = mock_mds
        
        result = pipeline.process(make_raw_filing())
        
        assert result.event_type is not None
        assert result.impact_score is not None
        assert result.price_at_filing == 150.0

    def test_process_pending_skips_enrichment(self):
        pending_processor = MockProcessor({
            "ticker": "UNKNOWN",
            "company": "Unknown",
            "summary": "Pending",
            "signal": "Pending",
            "confidence": 0,
        })
        pipeline = SignalPipeline(MagicMock())
        pipeline.register_processor("8-K", pending_processor)
        
        result = pipeline.process(make_raw_filing())
        
        assert result.signal == "Pending"
        assert result.event_type is None
        assert result.impact_score is None

    def test_process_survives_market_data_failure(self):
        pipeline = SignalPipeline(MagicMock())
        pipeline.register_processor("8-K", MockProcessor())
        
        mock_mds = MagicMock()
        mock_mds.get_price.side_effect = Exception("Yahoo down")
        mock_mds.get_news_headlines.side_effect = Exception("Yahoo down")
        pipeline._market_data = mock_mds
        
        # Should not raise — enrichment failure is non-fatal
        result = pipeline.process(make_raw_filing())
        assert result is not None
        assert result.ticker == "TEST"

    def test_config_version_passed_through(self):
        pipeline = SignalPipeline(MagicMock())
        pipeline.register_processor("8-K", MockProcessor())
        pipeline.set_config_version(42)
        
        mock_mds = MagicMock()
        mock_mds.get_price.return_value = None
        mock_mds.get_news_headlines.return_value = []
        pipeline._market_data = mock_mds
        
        result = pipeline.process(make_raw_filing())
        assert result.config_version == 42


class TestSignalToDbRow:
    """Test conversion of ProcessedSignal to Supabase insert dict."""

    def test_includes_core_fields(self):
        pipeline = SignalPipeline(MagicMock())
        signal = ProcessedSignal(
            ticker="AAPL", company="Apple", filing_type="8-K",
            signal="Positive", confidence=80, summary="Test",
            accession_number="0001234", filed_at="2026-03-11",
        )
        row = pipeline.signal_to_db_row(signal)
        assert row["ticker"] == "AAPL"
        assert row["signal"] == "Positive"
        assert row["confidence"] == 80

    def test_excludes_none_enrichment(self):
        pipeline = SignalPipeline(MagicMock())
        signal = ProcessedSignal(
            ticker="AAPL", company="Apple", filing_type="8-K",
            signal="Pending", confidence=0, summary="Test",
            accession_number="0001234", filed_at="2026-03-11",
        )
        row = pipeline.signal_to_db_row(signal)
        assert "event_type" not in row
        assert "impact_score" not in row

    def test_includes_enrichment_when_present(self):
        pipeline = SignalPipeline(MagicMock())
        signal = ProcessedSignal(
            ticker="AAPL", company="Apple", filing_type="8-K",
            signal="Positive", confidence=80, summary="Test",
            accession_number="0001234", filed_at="2026-03-11",
            event_type="EARNINGS_BEAT", impact_score=75,
            sentiment_delta=0.1, config_version=3,
        )
        row = pipeline.signal_to_db_row(signal)
        assert row["event_type"] == "EARNINGS_BEAT"
        assert row["impact_score"] == 75
        assert row["config_version_at_classification"] == 3
