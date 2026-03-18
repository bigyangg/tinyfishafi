---
name: Phase 2 AI Signal Quality Upgrade
description: Structured Gemini output schemas, earnings quantification, retry logic, and NT processor added in Phase 2
type: project
---

Phase 2 AI Signal Quality upgrade completed on 2026-03-18.

Key changes:
- All 6 form processors now pass RESPONSE_SCHEMA to gemini_helper for structured JSON output via response_mime_type="application/json"
- gemini_helper.py updated to accept response_schema param and pass it through GenerateContentConfig
- Gemini retry with exponential backoff added at two levels: gemini_helper.py (direct Gemini path) and call_gemini_with_retry() in signal_pipeline.py
- form_8k.py and form_10q.py extended with earnings quantification fields (actual_eps, consensus_eps, eps_surprise_pct, revenue fields, guidance fields)
- chain_of_thought changed from dict to array format across all processors for schema consistency
- New FormNTProcessor (form_nt.py) for NT 10-K and NT 10-Q late filing notices -- always Risk signal
- 8-K/A processor registered reusing Form8KProcessor

**Why:** Gemini was returning non-JSON or malformed responses intermittently, causing JSONDecodeError failures. Structured output enforcement eliminates this class of errors.

**How to apply:** When adding new processors, always define a RESPONSE_SCHEMA class attribute and pass it to call_gemini(). Follow the array format for chain_of_thought (not the old dict format).
