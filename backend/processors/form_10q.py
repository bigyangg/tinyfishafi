# form_10q.py — 10-Q Quarterly Report Processor
# Purpose: Classify SEC 10-Q quarterly reports using Gemini AI

import os
import json
import logging
from signal_pipeline import FilingProcessor, RawFiling

logger = logging.getLogger(__name__)


class Form10QProcessor(FilingProcessor):
    """Processes 10-Q quarterly reports using Gemini AI classification."""

    SYSTEM_PROMPT = """You are a financial regulatory analyst. Given an SEC 10-Q quarterly report filing text, return ONLY a JSON object with no explanation:
{
  "ticker": "stock ticker or UNKNOWN",
  "company": "full company name",
  "summary": "one sentence plain English summary, max 25 words — focus on quarterly revenue, beat/miss, guidance",
  "signal": "Positive or Neutral or Risk",
  "confidence": integer 0-100,
  "chain_of_thought": ["step1: key quarterly results", "step2: who is affected", "step3: prior quarter comparison", "step4: bull case", "step5: bear case", "step6: final reasoning"],
  "key_facts": ["key quarterly fact 1", "key quarterly fact 2", "key quarterly fact 3"],
  "event_type": "one of: EARNINGS_BEAT, EARNINGS_MISS, EARNINGS_INLINE, GUIDANCE_RAISED, GUIDANCE_LOWERED, ROUTINE_QUARTERLY",
  "risk_factors": ["risk 1", "risk 2"]
}
Classify as Positive if: revenue beat, EPS beat, guidance raised, strong growth markers.
Classify as Risk if: revenue miss, guidance lowered, material weakness flagged.
Classify as Neutral for routine quarterly filings with no surprises.

Additionally, extract these financial metrics as numbers (use null if not present in the filing):
- actual_eps: reported EPS this quarter
- consensus_eps: analyst consensus EPS if mentioned
- eps_surprise_pct: percentage beat/miss vs consensus (positive = beat)
- actual_revenue_millions: reported revenue in millions
- consensus_revenue_millions: consensus revenue if mentioned
- revenue_surprise_pct: percentage beat/miss in %
- guidance_direction: one of "raised", "lowered", "maintained", "withdrawn", "none"
- guidance_magnitude_pct: how much guidance changed in % (null if not applicable)
- next_quarter_eps_guide: guided EPS for next quarter (null if not given)"""

    RESPONSE_SCHEMA = {
        "type": "OBJECT",
        "properties": {
            "ticker": {"type": "STRING"},
            "company": {"type": "STRING"},
            "signal": {"type": "STRING", "enum": ["Positive", "Neutral", "Risk"]},
            "confidence": {"type": "INTEGER"},
            "summary": {"type": "STRING"},
            "event_type": {"type": "STRING"},
            "key_facts": {"type": "ARRAY", "items": {"type": "STRING"}},
            "risk_factors": {"type": "ARRAY", "items": {"type": "STRING"}},
            "chain_of_thought": {"type": "ARRAY", "items": {"type": "STRING"}},
            "actual_eps": {"type": "NUMBER"},
            "consensus_eps": {"type": "NUMBER"},
            "eps_surprise_pct": {"type": "NUMBER"},
            "actual_revenue_millions": {"type": "NUMBER"},
            "consensus_revenue_millions": {"type": "NUMBER"},
            "revenue_surprise_pct": {"type": "NUMBER"},
            "guidance_direction": {"type": "STRING"},
            "guidance_magnitude_pct": {"type": "NUMBER"},
            "next_quarter_eps_guide": {"type": "NUMBER"},
        },
        "required": ["signal", "confidence", "summary", "event_type"],
    }

    def classify(self, filing: RawFiling) -> dict:
        """Classify 10-Q filing with Gemini."""
        from processors.gemini_helper import call_gemini, has_api_key

        if not has_api_key():
            return {
                "ticker": "UNKNOWN", "company": filing.company_name,
                "summary": "Pending AI classification", "signal": "Pending", "confidence": 0,
            }

        try:
            text = filing.filing_text[:15000] if filing.filing_text else f"10-Q quarterly report by {filing.company_name}"
            prompt = f"{self.SYSTEM_PROMPT}\n\nAnalyze this SEC 10-Q quarterly report:\n\n{text}"

            response_text = call_gemini(
                prompt,
                session_id=f"10q-{filing.accession_number}",
                response_schema=self.RESPONSE_SCHEMA,
            )
            if not response_text:
                raise ValueError("Empty response")

            if response_text.startswith("```"):
                parts = response_text.split("```")
                if len(parts) >= 3:
                    response_text = parts[1]
                    if response_text.startswith("json"):
                        response_text = response_text[4:]

            result = json.loads(response_text.strip())

            # Build form_data merging legacy quarterly fields and earnings quantification
            form_data = {}
            for field in [
                "quarterly_revenue", "quarterly_net_income", "eps",
                "guidance", "beat_miss",
                "actual_eps", "consensus_eps", "eps_surprise_pct",
                "actual_revenue_millions", "consensus_revenue_millions",
                "revenue_surprise_pct", "guidance_direction",
                "guidance_magnitude_pct", "next_quarter_eps_guide",
            ]:
                if result.get(field) is not None:
                    form_data[field] = result[field]

            return {
                "ticker": str(result.get("ticker", "UNKNOWN")).upper(),
                "company": str(result.get("company", filing.company_name)),
                "summary": str(result.get("summary", ""))[:200],
                "signal": result.get("signal", "Neutral") if result.get("signal") in ("Positive", "Neutral", "Risk") else "Neutral",
                "confidence": min(100, max(0, int(result.get("confidence", 50)))),
                "chain_of_thought": result.get("chain_of_thought"),
                "key_facts": result.get("key_facts", []),
                "event_type": result.get("event_type"),
                "risk_factors": result.get("risk_factors", []),
                "form_data": form_data if form_data else None,
            }
        except json.JSONDecodeError as e:
            logger.error(f"[PIPELINE:10-Q] Failed to parse Gemini response: {e}")
        except Exception as e:
            logger.error(f"[PIPELINE:10-Q] Gemini classification error: {e}")

        return {
            "ticker": "UNKNOWN", "company": filing.company_name,
            "summary": f"AI classification failed for {filing.company_name}",
            "signal": "Pending", "confidence": 0,
        }
