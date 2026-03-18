# form_4.py — Form 4 Insider Transaction Processor
# Purpose: Classify SEC Form 4 insider buy/sell filings using Gemini AI

import os
import json
import logging
from signal_pipeline import FilingProcessor, RawFiling

logger = logging.getLogger(__name__)


class Form4Processor(FilingProcessor):
    """Processes Form 4 insider transaction filings using Gemini AI classification."""

    SYSTEM_PROMPT = """You are a financial regulatory analyst. Given an SEC Form 4 insider transaction filing text, return ONLY a JSON object with no explanation:
{
  "ticker": "stock ticker or UNKNOWN",
  "company": "full company name",
  "summary": "one sentence: who bought/sold, their role, how many shares, dollar value — max 25 words",
  "signal": "Positive or Neutral or Risk",
  "confidence": integer 0-100,
  "chain_of_thought": ["step1: describe the insider transaction", "step2: insider role and significance", "step3: pattern of buying/selling", "step4: bull case", "step5: bear case", "step6: final reasoning"],
  "key_facts": ["insider name and role", "shares bought or sold", "dollar value"],
  "event_type": "one of: INSIDER_BUY, INSIDER_SELL, INSIDER_OPTION_EXERCISE, INSIDER_GIFT, INSIDER_CLUSTER_BUY, INSIDER_CLUSTER_SELL",
  "risk_factors": ["risk 1", "risk 2"],
  "form_data": {
    "insider_name": "name of the insider",
    "insider_role": "CEO / CFO / Director / 10% Owner / etc.",
    "transaction_type": "buy / sell / gift / option exercise",
    "shares": "number of shares transacted",
    "price_per_share": "price per share if available",
    "total_value": "total dollar value of transaction",
    "shares_owned_after": "total shares owned after transaction if available"
  }
}
Classify as Positive if: CEO/CFO buying significant shares (strongest signal), large insider purchase.
Classify as Risk if: multiple insiders selling, CEO selling large blocks.
Classify as Neutral for: routine option exercises, small transactions, gifts."""

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
                    "insider_name": {"type": "STRING"},
                    "insider_role": {"type": "STRING"},
                    "transaction_type": {"type": "STRING"},
                    "shares": {"type": "STRING"},
                    "price_per_share": {"type": "STRING"},
                    "total_value": {"type": "STRING"},
                    "shares_owned_after": {"type": "STRING"},
                },
            },
        },
        "required": ["signal", "confidence", "summary", "event_type"],
    }

    def classify(self, filing: RawFiling) -> dict:
        """Classify Form 4 filing with Gemini."""
        from processors.gemini_helper import call_gemini, has_api_key

        if not has_api_key():
            return {
                "ticker": "UNKNOWN", "company": filing.company_name,
                "summary": "Pending AI classification", "signal": "Pending", "confidence": 0,
            }

        try:
            text = filing.filing_text[:10000] if filing.filing_text else f"Form 4 insider filing for {filing.company_name}"
            prompt = f"{self.SYSTEM_PROMPT}\n\nAnalyze this SEC Form 4 insider transaction:\n\n{text}"

            response_text = call_gemini(
                prompt,
                session_id=f"form4-{filing.accession_number}",
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
            logger.error(f"[PIPELINE:FORM4] Failed to parse Gemini response: {e}")
        except Exception as e:
            logger.error(f"[PIPELINE:FORM4] Gemini classification error: {e}")

        return {
            "ticker": "UNKNOWN", "company": filing.company_name,
            "summary": f"AI classification failed for {filing.company_name}",
            "signal": "Pending", "confidence": 0,
        }
