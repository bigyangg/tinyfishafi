# form_sc13d.py — SC 13D Activist/Ownership Processor
# Purpose: Classify SEC SC 13D beneficial ownership filings using Gemini AI

import os
import json
import logging
from signal_pipeline import FilingProcessor, RawFiling

logger = logging.getLogger(__name__)


class FormSC13DProcessor(FilingProcessor):
    """Processes SC 13D activist ownership filings using Gemini AI classification."""

    SYSTEM_PROMPT = """You are a financial regulatory analyst. Given an SEC SC 13D beneficial ownership filing text, return ONLY a JSON object with no explanation:
{
  "ticker": "stock ticker or UNKNOWN",
  "company": "full company name (the company whose shares are owned)",
  "summary": "one sentence: who acquired >5%, their intent, stake size — max 25 words",
  "signal": "Positive or Neutral or Risk",
  "confidence": integer 0-100,
  "chain_of_thought": ["step1: describe ownership stake acquisition", "step2: filer history", "step3: activist track record", "step4: bull case", "step5: bear case", "step6: final reasoning"],
  "key_facts": ["filer name", "ownership percentage", "stated intent"],
  "event_type": "one of: ACTIVIST_STAKE, PASSIVE_STAKE, HOSTILE_TAKEOVER, BOARD_DEMAND, MERGER_PROPOSAL, STAKE_INCREASE, STAKE_DECREASE",
  "risk_factors": ["risk 1", "risk 2"],
  "form_data": {
    "filer_name": "name of the beneficial owner / fund",
    "ownership_pct": "percentage of shares owned",
    "shares_held": "number of shares held",
    "intent": "investment / activist / merger proposal / board seats / passive",
    "is_activist": true or false,
    "is_new_position": true or false
  }
}
Classify as Positive if: well-known activist investor pushing for value creation, merger proposal.
Classify as Risk if: hostile takeover attempt, unknown entity acquiring large stake, potential dilution concern.
Classify as Neutral for: passive investment, routine 13D amendments with no change in intent."""

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
            "form_data": {
                "type": "OBJECT",
                "properties": {
                    "filer_name": {"type": "STRING"},
                    "ownership_pct": {"type": "STRING"},
                    "shares_held": {"type": "STRING"},
                    "intent": {"type": "STRING"},
                    "is_activist": {"type": "BOOLEAN"},
                    "is_new_position": {"type": "BOOLEAN"},
                },
            },
        },
        "required": ["signal", "confidence", "summary", "event_type"],
    }

    def classify(self, filing: RawFiling) -> dict:
        """Classify SC 13D filing with Gemini."""
        from processors.gemini_helper import call_gemini, has_api_key

        if not has_api_key():
            return {
                "ticker": "UNKNOWN", "company": filing.company_name,
                "summary": "Pending AI classification", "signal": "Pending", "confidence": 0,
            }

        try:
            text = filing.filing_text[:12000] if filing.filing_text else f"SC 13D filing for {filing.company_name}"
            prompt = f"{self.SYSTEM_PROMPT}\n\nAnalyze this SEC SC 13D beneficial ownership filing:\n\n{text}"

            response_text = call_gemini(
                prompt,
                session_id=f"sc13d-{filing.accession_number}",
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
                "form_data": result.get("form_data"),
            }
        except json.JSONDecodeError as e:
            logger.error(f"[PIPELINE:SC13D] Failed to parse Gemini response: {e}")
        except Exception as e:
            logger.error(f"[PIPELINE:SC13D] Gemini classification error: {e}")

        return {
            "ticker": "UNKNOWN", "company": filing.company_name,
            "summary": f"AI classification failed for {filing.company_name}",
            "signal": "Pending", "confidence": 0,
        }
