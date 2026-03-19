---
name: Form-Specific Extraction Strategy
description: 10-K/10-Q skip TinyFish entirely and use SEC structured APIs — eliminates 685s+ latency on annual reports
type: project
---

10-K and 10-Q filings are 200-500 pages. Running them through TinyFish browser render caused 685+ second extraction times.

The fix adds `EXTRACTION_STRATEGY` in `backend/agents/edgar_filing_agent.py`:
- `10-K`, `10-K/A` → `sec_api_primary` (XBRL facts + submissions metadata + filing items)
- `10-Q`, `10-Q/A` → `sec_api_then_http` (SEC API first, HTTP fallback)
- `8-K`, `8-K/A`, `SC 13D` → `tinyfish_then_http` (unchanged)
- `4`, `DEF 14A`, `NT 10-K`, `NT 10-Q` → `http_direct` (TinyFish not needed for simple forms)
- `S-1` → `sec_api_then_http`

The synchronous `_extract_filing_text` in `backend/edgar_agent.py` (main polling loop) was also updated to accept `form_type` and calls `_extract_large_form_sync()` for 10-K/10-Q, which uses synchronous httpx to hit XBRL facts and submissions APIs.

`form_type` was moved to be resolved *before* the extraction call in `_process_filing()` (it used to be resolved inside the `if self._pipeline:` block that followed).

Result: 10-K extraction drops from 685s to ~3.4s. Source is `sec_api` with real XBRL financial data.

**Why:** TinyFish browser automation is designed for short interactive pages. Annual reports are 200-500 pages of HTML that TinyFish renders sequentially — it was never going to be fast for this use case.

**How to apply:** If adding new large-form processors (e.g., 20-F, ARS), add them to `EXTRACTION_STRATEGY` as `sec_api_primary` and update `LARGE_FORM_TYPES` in `edgar_agent.py`'s `_extract_filing_text`.
