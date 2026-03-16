# form_10k.py — 10-K Annual Report Processor
# Purpose: Classify SEC 10-K annual reports using Gemini AI

import os
import json
import logging
from signal_pipeline import FilingProcessor, RawFiling

logger = logging.getLogger(__name__)


class Form10KProcessor(FilingProcessor):
    """Processes 10-K annual reports using Gemini AI classification."""

    SYSTEM_PROMPT = """You are a financial regulatory analyst. Given an SEC 10-K annual report filing text, return ONLY a JSON object with no explanation:
{
  "ticker": "stock ticker or UNKNOWN",
  "company": "full company name",
  "summary": "one sentence plain English summary, max 25 words — focus on revenue, profit, risk highlights",
  "signal": "Positive or Neutral or Risk",
  "confidence": integer 0-100,
  "chain_of_thought": {
    "step1_what_happened": "key financial results from the annual report",
    "step2_who_is_affected": "who benefits or is harmed by these results",
    "step3_historical_context": "comparison to prior year performance",
    "step4_bull_case": "why this could be positive for investors",
    "step5_bear_case": "why this could be negative for investors",
    "step6_final_reasoning": "your final reasoning for the signal"
  },
  "key_facts": ["key financial fact 1", "key financial fact 2", "key financial fact 3"],
  "form_data": {
    "revenue": "total revenue if found",
    "net_income": "net income if found",
    "risk_factors_summary": "one sentence on key risk factor changes",
    "auditor_opinion": "unqualified / qualified / going concern / adverse",
    "yoy_revenue_change": "percentage change year over year if determinable"
  }
}
Classify as Risk if: going concern opinion, revenue decline >10%, material weakness, major litigation.
Classify as Positive if: revenue growth, profit improvement, clean audit opinion, strong guidance.
Classify as Neutral for routine annual reports with no notable changes."""

    def classify(self, filing: RawFiling) -> dict:
        """Classify 10-K filing with Gemini."""
        from processors.gemini_helper import call_gemini, has_api_key

        if not has_api_key():
            return {
                "ticker": "UNKNOWN", "company": filing.company_name,
                "summary": "Pending AI classification", "signal": "Pending", "confidence": 0,
            }

        try:
            text = filing.filing_text[:15000] if filing.filing_text else f"10-K annual report by {filing.company_name}"
            prompt = f"{self.SYSTEM_PROMPT}\n\nAnalyze this SEC 10-K annual report:\n\n{text}"

            response_text = call_gemini(prompt, session_id=f"10k-{filing.accession_number}")
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
                "form_data": result.get("form_data"),
            }
        except json.JSONDecodeError as e:
            logger.error(f"[PIPELINE:10-K] Failed to parse Gemini response: {e}")
        except Exception as e:
            logger.error(f"[PIPELINE:10-K] Gemini classification error: {e}")

        return {
            "ticker": "UNKNOWN", "company": filing.company_name,
            "summary": f"AI classification failed for {filing.company_name}",
            "signal": "Pending", "confidence": 0,
        }
