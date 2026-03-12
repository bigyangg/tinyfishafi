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
  "chain_of_thought": {
    "step1_what_happened": "key quarterly financial results",
    "step2_who_is_affected": "who benefits or is harmed",
    "step3_historical_context": "comparison to prior quarter and same quarter last year",
    "step4_bull_case": "why this quarter could be positive",
    "step5_bear_case": "why this quarter could be negative",
    "step6_final_reasoning": "your final reasoning for the signal"
  },
  "key_facts": ["key quarterly fact 1", "key quarterly fact 2", "key quarterly fact 3"],
  "form_data": {
    "quarterly_revenue": "quarterly revenue if found",
    "quarterly_net_income": "quarterly net income if found",
    "eps": "earnings per share if found",
    "guidance": "raised / lowered / maintained / not mentioned",
    "beat_miss": "beat / miss / in-line / unclear"
  }
}
Classify as Positive if: revenue beat, EPS beat, guidance raised, strong growth markers.
Classify as Risk if: revenue miss, guidance lowered, material weakness flagged.
Classify as Neutral for routine quarterly filings with no surprises."""

    def classify(self, filing: RawFiling) -> dict:
        """Classify 10-Q filing with Gemini."""
        gemini_key = os.environ.get("GEMINI_API_KEY", "")

        if not gemini_key or gemini_key.startswith("YOUR_"):
            return {
                "ticker": "UNKNOWN", "company": filing.company_name,
                "summary": "Pending AI classification", "signal": "Pending", "confidence": 0,
            }

        try:
            from google import genai
            client = genai.Client(api_key=gemini_key)

            text = filing.filing_text[:15000] if filing.filing_text else f"10-Q quarterly report by {filing.company_name}"
            prompt = f"{self.SYSTEM_PROMPT}\n\nAnalyze this SEC 10-Q quarterly report:\n\n{text}"

            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
            )
            response_text = response.text.strip()

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
            logger.error(f"[PIPELINE:10-Q] Failed to parse Gemini response: {e}")
        except Exception as e:
            logger.error(f"[PIPELINE:10-Q] Gemini classification error: {e}")

        return {
            "ticker": "UNKNOWN", "company": filing.company_name,
            "summary": f"AI classification failed for {filing.company_name}",
            "signal": "Pending", "confidence": 0,
        }
