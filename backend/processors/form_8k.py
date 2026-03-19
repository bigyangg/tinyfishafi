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
  "confidence": "<50-95 integer, NEVER 0 — use 55 minimum if filing has real content>",
  "why_it_matters": "one sentence: cause → market effect",
  "market_impact": "one sentence: which assets move and direction",
  "chain_of_thought": ["step1: what happened", "step2: who is affected", "step3: historical context", "step4: bull case", "step5: bear case", "step6: final reasoning"],
  "key_facts": ["fact 1", "fact 2", "fact 3"],
  "event_type": "one of: EARNINGS_BEAT, EARNINGS_MISS, EXEC_DEPARTURE, EXEC_HIRE, DEBT_FINANCING, CONTRACT_WIN, SHARE_BUYBACK, MERGER_ACQUISITION, GUIDANCE_RAISED, GUIDANCE_CUT, LEGAL_SETTLEMENT, RESTRUCTURING, ROUTINE_FILING",
  "risk_factors": ["risk 1", "risk 2"]
}

Confidence rules:
- 80-95: clear signal with specific numbers (EPS, revenue, guidance %)
- 60-79: signal present, limited quantitative data
- 50-59: vague or ambiguous
- NEVER below 50 if the filing text has real content (>300 chars)

Classify as Risk if: executive departure, litigation, debt issues, restatement, going concern.
Classify as Positive if: revenue beat, new contract, buyback, leadership upgrade.
Classify as Neutral for routine administrative filings.

IMPORTANT classification rules:
- Convertible note / promissory note / debt issuance → DEBT_FINANCING (Risk)
- Strategic partnership / new client / new contract → CONTRACT_WIN (Positive)
- CEO/CFO resigns → EXEC_DEPARTURE (Risk)
- New executive hired → EXEC_HIRE (Neutral/Positive)
- Revenue reported above expectations → EARNINGS_BEAT (Positive)
- Revenue reported below expectations → EARNINGS_MISS (Risk)

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
            "why_it_matters": {"type": "STRING"},
            "market_impact": {"type": "STRING"},
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
        """Classify 8-K filing with Gemini (model chain fallback + keyword fallback)."""
        from processors.gemini_helper import (
            call_gemini, has_api_key, keyword_classify, ensure_confidence_floor
        )

        text = filing.filing_text[:12000] if filing.filing_text else f"8-K filing by {filing.company_name}"

        if not has_api_key():
            logger.warning("[PIPELINE] No API key available — falling back to keyword classifier")
            result = keyword_classify(text, filing.company_name, "8-K")
            result.setdefault("ticker", "UNKNOWN")
            result.setdefault("company", filing.company_name)
            return result

        prompt = f"{self.SYSTEM_PROMPT}\n\nAnalyze this SEC 8-K filing:\n\n{text}"

        try:
            response_text = call_gemini(
                prompt,
                session_id=f"8k-{filing.accession_number}",
                response_schema=self.RESPONSE_SCHEMA,
            )

            if not response_text:
                raise ValueError("Empty response from AI")

            # Strip markdown fences if present
            if response_text.startswith("```"):
                parts = response_text.split("```")
                if len(parts) >= 3:
                    response_text = parts[1]
                    if response_text.startswith("json"):
                        response_text = response_text[4:]

            result = json.loads(response_text.strip())

            # Build form_data with earnings quantification fields
            form_data = {}
            for field in [
                "actual_eps", "consensus_eps", "eps_surprise_pct",
                "actual_revenue_millions", "consensus_revenue_millions",
                "revenue_surprise_pct", "guidance_direction",
                "guidance_magnitude_pct", "next_quarter_eps_guide",
            ]:
                if result.get(field) is not None:
                    form_data[field] = result[field]

            classification = {
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
                "why_it_matters": result.get("why_it_matters", ""),
                "market_impact": result.get("market_impact", ""),
            }
            return ensure_confidence_floor(classification, text)

        except json.JSONDecodeError as e:
            logger.error(f"[PIPELINE] Failed to parse Gemini response: {e}")
        except Exception as e:
            logger.error(f"[PIPELINE] Gemini classification error: {e}")

        # Final fallback: keyword classifier (never returns confidence=0 with content)
        logger.warning("[PIPELINE] Gemini failed — using keyword classifier for 8-K")
        result = keyword_classify(text, filing.company_name, "8-K")
        result.setdefault("ticker", "UNKNOWN")
        result.setdefault("company", filing.company_name)
        return result
