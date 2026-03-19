---
name: Known failure modes and their fixes
description: Production bugs discovered and fixed: EFTS q=* zero-result bug, deprecated Gemini models, TinyFish LLM guard on sec.gov, Atom feed XML parse format
type: project
---

## EFTS q=* returns 0 results (confirmed 2026-03-19)

The EFTS query `q=*` or `q=%2A` returns exactly 0 hits with HTTP 200 — silent data loss.
The fix: omit the `q` param entirely. `?forms=8-K&dateRange=custom&startdt=X&enddt=Y` returns 100+ hits.
Confirmed working: 100 hits, total=698 for 3-day window.

**Why:** EFTS wildcard behavior changed — `*` is no longer a valid glob for "all documents".
**How to apply:** Never use `q=*` in EFTS calls. Always omit q or use a specific search term.

---

## Atom feed XML format (confirmed 2026-03-19)

The SEC `browse-edgar?output=atom` feed does NOT use `<accession-number>` tags.
Actual format:
- `<id>urn:tag:sec.gov,2008:accession-number=XXXX-XX-XXXXXX</id>`
- `<title>8-K - Company Name (CIK) (Filer)</title>`
- `<link href="https://www.sec.gov/Archives/edgar/data/CIK/..."/>`

Regex patterns that work:
- Accession: `r'accession-number=(\d{10}-\d{2}-\d{6})'`
- CIK from link: `r'/data/(\d+)/'`
- Company from title: `r'^.+?\s+-\s+(.*?)\s*\(\d+\)'` (handles multi-word form types like "SC 13D")

**Why:** Old code used `<accession-number>` tag regex (from a different EDGAR endpoint format) — returned 0 entries even when feed had 10.

---

## Gemini deprecated models (confirmed 2026-03-19)

Models that return 404 on standard API keys in 2026:
- `gemini-1.5-pro` — deprecated, returns 404
- `gemini-2.5-flash` — not available on standard tier, returns 404
- `gemini-2.5-pro` — not available on standard tier, returns 404

Working fallback chain: `["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash", "gemini-1.5-flash-8b"]`

Note: `gemini-2.0-flash` also returned 404 on this API key — key may be on legacy quota.
In practice `gemini-1.5-flash` is the first working model for this deployment.

Emergent key model string: use `"gemini-2.0-flash"` not `"gemini-2.5-flash"`.

**How to apply:** Check `gemini_helper.py` `_GEMINI_MODEL_CHAIN` — no 1.5-pro or 2.5-x models.

---

## TinyFish LLM guard blocks sec.gov (confirmed 2026-03-19)

TinyFish's server-side LLM guard rejects runs targeting `sec.gov` URLs with "Blocked by LLM guard".
Fix: `_should_use_tinyfish(url)` in `EdgarFilingAgent` returns `False` for any `sec.gov` URL.
Also added `_find_primary_document_http()` — parses EDGAR index page directly via BeautifulSoup.

**Why:** SEC EDGAR filing index pages are static HTML — TinyFish adds no value and is blocked.
**How to apply:** Any new agent calling TinyFish on SEC URLs must add the same guard.

---

## edgar_agent.py _poll_edgar Approach 1 & 2 were identical (fixed 2026-03-19)

Both "Approach 1" and "Approach 2" in the old `_poll_edgar` used identical `q=*` EFTS queries.
Since EFTS returned HTTP 200 with 0 results (not an error), the `if not filings:` guard for
Approach 3 (Atom feed) never triggered. All three approaches silently failed.

Combined fix: (1) EFTS no-q as primary, (2) Atom feed as fallback, correct regex for both.
