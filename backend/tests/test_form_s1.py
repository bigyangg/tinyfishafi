"""Tests for form_s1.py — S-1 IPO Registration Statement Processor."""
import pytest
import json
from unittest.mock import patch, MagicMock
from signal_pipeline import RawFiling
from processors.form_s1 import FormS1Processor


def make_s1_filing(**overrides):
    defaults = {
        "accession_number": "0001234-25-000099",
        "filing_type": "S-1",
        "company_name": "TestIPO Inc",
        "entity_id": "99999",
        "filed_at": "2026-03-15",
        "filing_url": "https://sec.gov/test-s1",
        "filing_text": "S-1 registration statement. Revenue: $142M. Net loss: -$34M. Growth: +47% YoY.",
    }
    defaults.update(overrides)
    return RawFiling(**defaults)


MOCK_GEMINI_RESPONSE = json.dumps({
    "ticker": "TIPO",
    "company": "TestIPO Inc",
    "signal": "Positive",
    "confidence": 78,
    "summary": "Strong revenue growth IPO with credible path to profitability",
    "company_overview": "A fintech company providing automated testing solutions",
    "revenue_last_year": "$142M",
    "net_income_loss": "-$34M",
    "revenue_growth_yoy": "+47%",
    "use_of_proceeds": "Expand R&D and international operations",
    "lock_up_days": 180,
    "lead_underwriters": ["Goldman Sachs", "Morgan Stanley"],
    "insider_ownership_pct": 62,
    "top_risks": ["Competition from incumbents", "Regulatory changes", "Concentration risk"],
    "event_type": "IPO_REGISTRATION",
    "chain_of_thought": {
        "step1_what_happened": "S-1 registration statement filed",
        "step2_who_is_affected": "Early investors and public market participants",
        "step3_historical_context": "Similar to recent fintech IPOs",
        "step4_bull_case": "Strong revenue growth trajectory",
        "step5_bear_case": "Still unprofitable with narrow margins",
        "step6_final_reasoning": "Positive based on growth rate and credible underwriters",
    },
    "key_facts": ["Revenue grew 47% YoY", "Goldman Sachs as lead underwriter", "180-day lockup"],
})


class TestFormS1Processor:
    """Test S-1 processor classification."""

    @patch("processors.gemini_helper.has_api_key", return_value=True)
    @patch("processors.gemini_helper.call_gemini", return_value=MOCK_GEMINI_RESPONSE)
    def test_classify_returns_expected_fields(self, mock_gemini, mock_key):
        proc = FormS1Processor()
        result = proc.classify(make_s1_filing())

        assert result["ticker"] == "TIPO"
        assert result["signal"] == "Positive"
        assert result["confidence"] == 78
        assert "summary" in result
        assert result["event_type"] == "IPO_POSITIVE"  # Positive + IPO_REGISTRATION → IPO_POSITIVE

    @patch("processors.gemini_helper.has_api_key", return_value=True)
    @patch("processors.gemini_helper.call_gemini", return_value=MOCK_GEMINI_RESPONSE)
    def test_classify_includes_form_data(self, mock_gemini, mock_key):
        proc = FormS1Processor()
        result = proc.classify(make_s1_filing())

        form_data = result.get("form_data", {})
        assert form_data.get("revenue_last_year") == "$142M"
        assert form_data.get("lock_up_days") == 180
        assert "Goldman Sachs" in form_data.get("lead_underwriters", [])

    @patch("processors.gemini_helper.has_api_key", return_value=False)
    def test_classify_no_api_key_returns_pending(self, mock_key):
        proc = FormS1Processor()
        result = proc.classify(make_s1_filing())

        assert result["signal"] == "Pending"
        assert result["confidence"] == 0
        assert result["ticker"] == "UNKNOWN"

    @patch("processors.gemini_helper.has_api_key", return_value=True)
    @patch("processors.gemini_helper.call_gemini", return_value="```json\n" + MOCK_GEMINI_RESPONSE + "\n```")
    def test_classify_handles_markdown_fenced_json(self, mock_gemini, mock_key):
        proc = FormS1Processor()
        result = proc.classify(make_s1_filing())

        assert result["signal"] == "Positive"
        assert result["ticker"] == "TIPO"

    @patch("processors.gemini_helper.has_api_key", return_value=True)
    @patch("processors.gemini_helper.call_gemini", side_effect=Exception("API error"))
    def test_classify_handles_api_error_gracefully(self, mock_gemini, mock_key):
        proc = FormS1Processor()
        result = proc.classify(make_s1_filing())

        assert result["signal"] == "Pending"
        assert result["confidence"] == 0

    @patch("processors.gemini_helper.has_api_key", return_value=True)
    @patch("processors.gemini_helper.call_gemini", return_value="not valid json at all")
    def test_classify_handles_invalid_json(self, mock_gemini, mock_key):
        proc = FormS1Processor()
        result = proc.classify(make_s1_filing())

        assert result["signal"] == "Pending"
        assert result["confidence"] == 0


class TestS1EventTypeMapping:
    """Test event type derivation from signal + filing type."""

    @patch("processors.gemini_helper.has_api_key", return_value=True)
    @patch("processors.gemini_helper.call_gemini")
    def test_risk_signal_maps_to_ipo_risk(self, mock_gemini, mock_key):
        risk_response = json.loads(MOCK_GEMINI_RESPONSE)
        risk_response["signal"] = "Risk"
        mock_gemini.return_value = json.dumps(risk_response)

        proc = FormS1Processor()
        result = proc.classify(make_s1_filing())
        assert result["event_type"] == "IPO_RISK"

    @patch("processors.gemini_helper.has_api_key", return_value=True)
    @patch("processors.gemini_helper.call_gemini")
    def test_neutral_signal_keeps_ipo_registration(self, mock_gemini, mock_key):
        neutral_response = json.loads(MOCK_GEMINI_RESPONSE)
        neutral_response["signal"] = "Neutral"
        mock_gemini.return_value = json.dumps(neutral_response)

        proc = FormS1Processor()
        result = proc.classify(make_s1_filing())
        assert result["event_type"] == "IPO_REGISTRATION"
