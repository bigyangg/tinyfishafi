# form_s1.py — S-1 IPO Registration Statement Processor
# Purpose: Process S-1 and S-1/A filings using Gemini AI for IPO-specific intelligence
# Dependencies: signal_pipeline.FilingProcessor, processors.gemini_helper
# Env vars: GEMINI_API_KEY or EMERGENT_LLM_KEY

import os
import json
import logging
from signal_pipeline import FilingProcessor, RawFiling

logger = logging.getLogger(__name__)


class FormS1Processor(FilingProcessor):
    """Processes S-1 IPO registration statements and S-1/A amendments."""

    SYSTEM_PROMPT = """You are an expert IPO analyst reviewing an S-1 registration statement filed with the SEC.

Analyze this S-1 filing text and extract:

1. COMPANY OVERVIEW: What does this company do? (one sentence, plain English)
2. IPO SIGNAL: Classify as Positive, Neutral, or Risk based on fundamentals
3. KEY FINANCIALS:
   - Most recent annual revenue (exact figure if available)
   - Net income or net loss (exact figure)
   - Revenue growth rate year-over-year
   - Cash and cash equivalents
4. USE OF PROCEEDS: What will they do with the IPO money?
5. RISK FACTORS: Top 3 most material risks disclosed
6. LOCK-UP PERIOD: How many days? (typically 90 or 180)
7. UNDERWRITERS: Lead investment banks named
8. INSIDER OWNERSHIP: What % do founders/insiders retain post-IPO?
9. REVENUE MODEL: How does the company make money?

Scoring guidance:
- Positive: Revenue growing >20% YoY, credible path to profitability, brand-name underwriters
- Risk: Declining revenue, heavy losses with no path to profit, going concern language, excessive dilution
- Neutral: Mixed signals or insufficient data to assess

Return structured JSON only:
{
  "ticker": "stock ticker or UNKNOWN",
  "company": "full company name",
  "signal": "Positive|Neutral|Risk",
  "confidence": 0-100,
  "summary": "2-3 sentence plain English brief for a trader",
  "company_overview": "one sentence",
  "revenue_last_year": "e.g. $142M or null",
  "net_income_loss": "e.g. -$34M or null",
  "revenue_growth_yoy": "e.g. +47% or null",
  "use_of_proceeds": "brief description",
  "lock_up_days": 180,
  "lead_underwriters": ["Goldman Sachs", "Morgan Stanley"],
  "insider_ownership_pct": 62,
  "top_risks": ["risk 1", "risk 2", "risk 3"],
  "event_type": "IPO_REGISTRATION",
  "chain_of_thought": {
    "step1_what_happened": "S-1 registration statement filed",
    "step2_who_is_affected": "who benefits or is harmed",
    "step3_historical_context": "comparable IPO precedent",
    "step4_bull_case": "why this IPO could be strong",
    "step5_bear_case": "why this IPO could be risky",
    "step6_final_reasoning": "your final reasoning for the signal"
  },
  "key_facts": ["fact 1", "fact 2", "fact 3"]
}"""

    def classify(self, filing: RawFiling) -> dict:
        """Classify S-1 filing with Gemini (via Emergent key fallback)."""
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

        text = filing.filing_text[:15000] if filing.filing_text else f"S-1 registration statement by {filing.company_name}"
        prompt = f"{self.SYSTEM_PROMPT}\n\nAnalyze this SEC S-1 filing:\n\n{text}"

        try:
            response_text = call_gemini(prompt, session_id=f"s1-{filing.accession_number}")

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

            # Build form_data with IPO-specific fields
            form_data = {}
            for field in [
                "company_overview", "revenue_last_year", "net_income_loss",
                "revenue_growth_yoy", "use_of_proceeds", "lock_up_days",
                "lead_underwriters", "insider_ownership_pct", "top_risks",
            ]:
                if result.get(field) is not None:
                    form_data[field] = result[field]

            # Determine event_type from signal
            event_type = result.get("event_type", "IPO_REGISTRATION")
            signal = result.get("signal", "Neutral")
            if signal == "Positive" and event_type == "IPO_REGISTRATION":
                event_type = "IPO_POSITIVE"
            elif signal == "Risk" and event_type == "IPO_REGISTRATION":
                event_type = "IPO_RISK"

            return {
                "ticker": str(result.get("ticker", "UNKNOWN")).upper(),
                "company": str(result.get("company", filing.company_name)),
                "summary": str(result.get("summary", ""))[:200],
                "signal": signal if signal in ("Positive", "Neutral", "Risk") else "Neutral",
                "confidence": min(100, max(0, int(result.get("confidence", 50)))),
                "chain_of_thought": result.get("chain_of_thought"),
                "key_facts": result.get("key_facts", []),
                "form_data": form_data,
                "event_type": event_type,
            }
        except json.JSONDecodeError as e:
            logger.error(f"[PIPELINE] Failed to parse Gemini S-1 response: {e}")
        except Exception as e:
            logger.error(f"[PIPELINE] Gemini S-1 classification error: {e}")

        return {
            "ticker": "UNKNOWN",
            "company": filing.company_name,
            "summary": f"AI classification failed for {filing.company_name} S-1",
            "signal": "Pending",
            "confidence": 0,
        }
