# form_nt.py — NT 10-K and NT 10-Q Processor (Late Filing Notices)
# Purpose: NT filings are automatic Risk signals — inability to file on time
# is a serious red flag (auditor issues, restatements, SEC investigations).
# Dependencies: signal_pipeline.FilingProcessor, processors.gemini_helper

import logging
import json

from signal_pipeline import FilingProcessor, RawFiling

logger = logging.getLogger(__name__)

SEVERITY_TRIGGERS = [
    "restatement", "restate", "going concern", "material weakness",
    "sec investigation", "sec inquiry", "auditor", "audit committee",
    "internal control", "fraud", "irregularities"
]


class FormNTProcessor(FilingProcessor):
    """NT 10-K and NT 10-Q processor — late filing notice = automatic risk.

    Any company that cannot file on time often has auditor issues, restatements,
    SEC investigations, or material weaknesses. These are always classified as
    Risk signals with high confidence.
    """

    RESPONSE_SCHEMA = {
        "type": "OBJECT",
        "properties": {
            "reason": {"type": "STRING"},
            "severity_flags": {"type": "ARRAY", "items": {"type": "STRING"}},
        },
        "required": ["reason"],
    }

    def classify(self, filing: RawFiling) -> dict:
        """Classify NT filing — always Risk, extract reason via Gemini if available."""
        from processors.gemini_helper import call_gemini, has_api_key

        reason = "Unable to determine reason"
        severity_flags = []

        # Try to extract reason using Gemini if available
        if has_api_key():
            try:
                reason_prompt = (
                    f"This is an SEC {filing.filing_type} (notification of late filing) for "
                    f"{filing.company_name}.\n"
                    f"Extract the stated reason for the late filing.\n"
                    f"Also identify if any of these severity flags are mentioned: "
                    f"restatement, going_concern, sec_investigation, material_weakness, auditor_issues.\n"
                    f"Return JSON with 'reason' (brief text) and 'severity_flags' (array of strings).\n\n"
                    f"Filing text:\n{(filing.filing_text or '')[:3000]}"
                )

                response_text = call_gemini(
                    reason_prompt,
                    session_id=f"nt-{filing.accession_number}",
                    response_schema=self.RESPONSE_SCHEMA,
                )

                if response_text:
                    # Strip markdown fences if present
                    if response_text.startswith("```"):
                        parts = response_text.split("```")
                        if len(parts) >= 3:
                            response_text = parts[1]
                            if response_text.startswith("json"):
                                response_text = response_text[4:]

                    parsed = json.loads(response_text.strip())
                    reason = parsed.get("reason", reason)
                    severity_flags = parsed.get("severity_flags", [])
            except Exception as e:
                logger.warning(f"[PIPELINE:NT] Gemini extraction failed for {filing.company_name}: {e}")
                # Fallback: scan text for keywords
                text_lower = (filing.filing_text or "").lower()
                for trigger in SEVERITY_TRIGGERS:
                    if trigger in text_lower:
                        severity_flags.append(trigger.replace(" ", "_"))
        else:
            # No API key — fallback to keyword scan
            text_lower = (filing.filing_text or "").lower()
            for trigger in SEVERITY_TRIGGERS:
                if trigger in text_lower:
                    severity_flags.append(trigger.replace(" ", "_"))

        # Determine if CRITICAL based on flags
        critical_flags = {"restatement", "going_concern", "sec_investigation", "material_weakness"}
        is_critical = bool(critical_flags.intersection(set(severity_flags)))
        severity = "CRITICAL" if is_critical else "HIGH"

        # Always Risk signal for late filings
        confidence = 92 if is_critical else 85

        return {
            "ticker": "UNKNOWN",
            "company": filing.company_name,
            "signal": "Risk",
            "confidence": confidence,
            "event_type": "LATE_FILING_NOTICE",
            "summary": f"{filing.company_name} filed {filing.filing_type} (late filing notice): {reason}"[:200],
            "key_facts": [
                f"Late {filing.filing_type} filing notice",
                reason,
                f"Severity: {severity}",
            ],
            "risk_factors": severity_flags if severity_flags else ["late_filing"],
            "chain_of_thought": [
                f"Received {filing.filing_type} — notification of inability to file on time",
                f"Extracted reason: {reason}",
                f"Severity flags detected: {severity_flags or ['none']}",
                f"Late filings are automatically classified as Risk with {confidence}% confidence",
            ],
            "form_data": {
                "late_filing_reason": reason,
                "severity": severity,
                "severity_flags": severity_flags,
                "form_type": filing.filing_type,
            },
        }
