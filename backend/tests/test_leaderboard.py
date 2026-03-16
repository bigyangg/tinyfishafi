"""Tests for the divergence leaderboard endpoint."""
import pytest
from intelligence.enrichment_pipeline import build_enrichment_columns


class TestBuildEnrichmentColumnsGenome:
    """Test that genome columns are correctly mapped in build_enrichment_columns."""

    def test_genome_columns_populated(self):
        enrichment = {
            "news": {}, "social": {}, "insider": {}, "congress": {},
            "genome": {
                "total_filings": 30,
                "amendment_count": 1,
                "filing_types": {"10-K": 5, "10-Q": 15, "8-K": 10},
            },
        }
        columns = build_enrichment_columns(enrichment, {})

        assert "genome_score" in columns
        assert "genome_trend" in columns
        assert columns["genome_alert"] is False  # amendment_count <= 2

    def test_genome_alert_fires_when_amendments_high(self):
        enrichment = {
            "news": {}, "social": {}, "insider": {}, "congress": {},
            "genome": {
                "total_filings": 20,
                "amendment_count": 5,
                "filing_types": {"10-K": 5, "10-K/A": 5, "8-K": 10},
            },
        }
        columns = build_enrichment_columns(enrichment, {})

        assert columns["genome_alert"] is True
        assert columns["genome_trend"] == "DETERIORATING"

    def test_genome_empty_when_no_data(self):
        enrichment = {
            "news": {}, "social": {}, "insider": {}, "congress": {},
            "genome": {},
        }
        columns = build_enrichment_columns(enrichment, {})

        assert "genome_score" not in columns
        assert "genome_alert" not in columns

    def test_genome_pattern_matches_populated(self):
        enrichment = {
            "news": {}, "social": {}, "insider": {}, "congress": {},
            "genome": {
                "total_filings": 10,
                "amendment_count": 0,
                "filing_types": {"10-K": 3, "8-K": 7},
            },
        }
        columns = build_enrichment_columns(enrichment, {})

        assert "genome_pattern_matches" in columns
        import json
        patterns = json.loads(columns["genome_pattern_matches"])
        assert len(patterns) > 0
        assert patterns[0]["pattern"] == "8-K"  # Most frequent first


class TestBuildEnrichmentColumnsDivergence:
    """Test that divergence columns are correctly mapped."""

    def test_divergence_columns_populated(self):
        enrichment = {"news": {}, "social": {}, "insider": {}, "congress": {}, "genome": {}}
        divergence = {
            "divergence_score": 85,
            "severity": "CRITICAL",
            "contradiction_summary": "Revenue claims don't match filing data",
            "public_claim": "Record revenue quarter",
            "filing_reality": "Revenue declined 12% YoY",
        }
        columns = build_enrichment_columns(enrichment, divergence)

        assert columns["divergence_score"] == 85
        assert columns["divergence_severity"] == "CRITICAL"
        assert columns["public_claim"] == "Record revenue quarter"

    def test_no_divergence_when_empty(self):
        enrichment = {"news": {}, "social": {}, "insider": {}, "congress": {}, "genome": {}}
        columns = build_enrichment_columns(enrichment, {})

        assert "divergence_score" not in columns


class TestBuildEnrichmentColumnsInsider:
    """Test insider activity column mapping."""

    def test_insider_columns_populated(self):
        enrichment = {
            "news": {}, "social": {}, "congress": {}, "genome": {},
            "insider": {
                "net_30d_value": -500000,
                "net_90d_value": -1200000,
                "ceo_activity": "SELLING",
                "unusual_delay_detected": True,
            },
        }
        columns = build_enrichment_columns(enrichment, {})

        assert columns["insider_net_30d"] == -500000.0
        assert columns["insider_ceo_activity"] == "SELLING"
        assert columns["insider_unusual_delay"] is True
