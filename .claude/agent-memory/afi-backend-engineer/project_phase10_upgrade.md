---
name: Phase 10 Backend Upgrade
description: Tracks the Phase 10 pipeline reliability changes: EDGAR connectivity, CIK fallback, dead-letter queue, dynamic polling, content hash dedup
type: project
---

Phase 10 added five reliability layers to the backend pipeline.

**Why:** Pipeline had no visibility into EDGAR unreachability, no CIK fallback beyond SEC JSON, no dead-letter queue for failed filings, static 120s poll interval ignoring market hours, and duplicate filing text being processed multiple times.

**How to apply:** When debugging filing gaps, check failed_filings table first. When health shows edgar_connectivity.reachable=false, the agent is retrying every 60s automatically.

Key decisions:

1. `check_edgar_connectivity()` is async — called via `asyncio.run()` from the sync `start()` method and from inside `_poll_loop`. If unreachable, polls retry every 60s (not 120s).

2. `_resolve_ticker_from_cik` is kept synchronous (runs in threading context from `_process_filing`). Three steps: SEC JSON -> yfinance Search -> `UNKNOWN__{cik}`. All guards that checked `!= "UNKNOWN"` now check `.startswith("UNKNOWN")` to catch both.

3. `signal_pipeline.process()` wraps `_process_inner()`. Stage tracking uses `stage_ref = ["init"]` (mutable list) so `_process_inner` can update `stage_ref[0]` and the outer except reads the last stage. Dead-letter upsert uses accession_number as conflict key.

4. `get_poll_interval()` returns: 45s (pre-market 4-9am ET), 90s (market hours 9-4pm), 60s (after-hours 4-8pm), 300s (overnight). Recalculated at each cycle start.

5. Content hash = SHA-256 of first 5000 chars. Checked against signals.content_hash before pipeline.process(). edgar_agent passes content_hash into signal_row directly; signal_pipeline.ProcessedSignal has content_hash field for demo/trigger path.

6. New SQL table: failed_filings (accession_number UNIQUE, retry_count, next_retry_at, resolved, error_stage, error_message). Index on (resolved, retry_count, next_retry_at).

7. New SQL columns: signals.content_hash TEXT + index idx_signals_content_hash.

8. retry_failed_filings() runs every 600s, max 3 retries, exponential backoff (2^n minutes). Marks resolved=True on success even if signal=None.

9. FORMS_TO_MONITOR extended with: DEF 14A, NT 10-K, NT 10-Q, 8-K/A, CORRESP. Linter also auto-registered NT and 8-K/A processors in signal_pipeline._register_default_processors.
