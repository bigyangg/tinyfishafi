# form_8k.py — 8-K Filing Processor
# Purpose: Classify SEC 8-K filings using Gemini AI
# Extracted from signal_pipeline.py for the multi-form processor registry

import os
import json
import logging
from signal_pipeline import FilingProcessor, RawFiling

logger = logging.getLogger(__name__)


class Form8KProcessor(FilingProcessor):
    """Processes 8-K filings using Gemini AI classification."""

    SYSTEM_PROMPT = """You are a financial regulatory analyst. Given an SEC 8-K filing text, return ONLY a JSON object with no explanation:
{
  "ticker": "stock ticker or UNKNOWN",
  "company": "full company name",
  "summary": "one sentence plain English summary, max 25 words",
  "signal": "Positive or Neutral or Risk",
  "confidence": integer 0-100,
  "chain_of_thought": {
    "step1_what_happened": "brief description of the event",
    "step2_who_is_affected": "who benefits or is harmed",
    "step3_historical_context": "any relevant precedent",
    "step4_bull_case": "why this could be positive",
    "step5_bear_case": "why this could be negative",
    "step6_final_reasoning": "your final reasoning for the signal"
  },
  "key_facts": ["fact 1", "fact 2", "fact 3"]
}
Classify as Risk if: executive departure, litigation, debt issues, restatement, going concern.
Classify as Positive if: revenue beat, new contract, buyback, leadership upgrade.
Classify as Neutral for routine administrative filings.

IMPORTANT classification rules:
- Convertible note / promissory note / debt issuance → DEBT_FINANCING (Risk)
- Strategic partnership / new client / new contract → CONTRACT_WIN (Positive)  
- CEO/CFO resigns → EXEC_DEPARTURE (Risk)
- New executive hired → EXEC_APPOINTMENT (Neutral/Positive)
- Revenue reported above expectations → EARNINGS_BEAT (Positive)
- Revenue reported below expectations → EARNINGS_MISS (Risk)"""

    def classify(self, filing: RawFiling) -> dict:
        """Classify 8-K filing with Gemini (via Emergent key fallback)."""
        from processors.gemini_helper import call_gemini, has_api_key

        if not has_api_key():
            logger.warning("[PIPELINE] No API key available — returning Pending")
            return {
                "ticker": "UNKNOWN",
                "company": filing.company_name,
                "summary": "Pending AI classification",
                "signal": "Pending",
                "confidence": 0,
            }

        text = filing.filing_text[:12000] if filing.filing_text else f"8-K filing by {filing.company_name}"
        prompt = f"{self.SYSTEM_PROMPT}\n\nAnalyze this SEC 8-K filing:\n\n{text}"

        try:
            response_text = call_gemini(prompt, session_id=f"8k-{filing.accession_number}")

            if not response_text:
                raise ValueError("Empty response from AI")

            # Parse JSON from response
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
            }
        except json.JSONDecodeError as e:
            logger.error(f"[PIPELINE] Failed to parse Gemini response: {e}")
        except Exception as e:
            logger.error(f"[PIPELINE] Gemini classification error: {e}")

        return {
            "ticker": "UNKNOWN",
            "company": filing.company_name,
            "summary": f"AI classification failed for {filing.company_name}",
            "signal": "Pending",
            "confidence": 0,
        }
