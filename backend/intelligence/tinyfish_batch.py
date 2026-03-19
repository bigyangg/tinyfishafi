"""
TinyFish Batch Extraction
Uses POST /v1/automation/run-batch to process multiple SEC filings
simultaneously. Up to 100 runs per request.

Before: trigger-all fires 6 TinyFish SSE calls sequentially → 2-5 min total
After:  all 6 submitted in one batch request → poll until done → ~50s total
"""
import httpx
import asyncio
import json
import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

TINYFISH_API = "https://agent.tinyfish.ai/v1/automation"
TINYFISH_KEY = os.environ.get("TINYFISH_API_KEY", "")

# Targeted goals per form type — specific = fast, generic = slow
FORM_GOALS = {
    "8-K": (
        'Return JSON: {"text": "<content>"}. '
        'Extract: event description, key figures, agreements. '
        'Skip boilerplate headers.'
    ),
    "8-K/A": (
        'Return JSON: {"text": "<content>"}. '
        'Extract: what changed from the original filing. Key amendments only.'
    ),
    "4": (
        'Return JSON: {"text": "<content>"}. '
        'Extract: person name, title, shares, price, transaction type, date.'
    ),
    "SC 13D": (
        'Return JSON: {"text": "<content>"}. '
        'Extract: investor name, stake %, intentions, key demands.'
    ),
    "10-Q": (
        'Return JSON: {"text": "<content>"}. '
        'Extract ONLY: revenue, net income, EPS, guidance if mentioned. Skip tables.'
    ),
    "10-K": (
        'Return JSON: {"text": "<content>"}. '
        'Extract ONLY: business overview, key annual metrics, major risks. '
        'Skip financial statements.'
    ),
    "S-1": (
        'Return JSON: {"text": "<content>"}. '
        'Extract: company description, IPO size, underwriters, use of proceeds, key risks.'
    ),
    "DEF 14A": (
        'Return JSON: {"text": "<content>"}. '
        'Extract: exec compensation, key votes, board changes.'
    ),
    "NT 10-K": (
        'Return JSON: {"text": "<content>"}. '
        'Get the reason for late filing in one paragraph.'
    ),
    "NT 10-Q": (
        'Return JSON: {"text": "<content>"}. '
        'Get the reason for late filing in one paragraph.'
    ),
}

# Poll interval and max wait per form type
POLL_INTERVAL = 4.0   # seconds between status checks
MAX_WAIT = {
    "8-K": 45,  "8-K/A": 45,  "4": 30,   "SC 13D": 60,
    "10-Q": 90, "10-K": 120,  "S-1": 120,
    "DEF 14A": 60, "NT 10-K": 30, "NT 10-Q": 30,
}
DEFAULT_MAX_WAIT = 120


async def batch_extract_filings(
    filings: list[dict],
    log_fn=None,
) -> dict[str, str]:
    """
    Extract text from multiple SEC filings simultaneously via TinyFish batch.

    Args:
        filings: list of {
            "id":        unique key (returned in result dict),
            "url":       SEC filing document URL,
            "form_type": "8-K" | "10-K" | etc,
            "ticker":    "NVDA",
            "company":   "NVIDIA Corp"  (optional)
        }
        log_fn: optional callable(message, level) for pipeline logging

    Returns:
        dict mapping id → extracted text string (empty string on failure)
    """
    api_key = os.environ.get("TINYFISH_API_KEY", "") or TINYFISH_KEY

    if not api_key:
        _log(log_fn, "No TINYFISH_API_KEY — skipping batch extraction", "warning")
        return {}

    if not filings:
        return {}

    def _log(fn, msg, level="info"):
        logger.info(msg) if level == "info" else logger.warning(msg)
        if fn:
            try:
                fn(msg, level)
            except Exception:
                pass

    _log(log_fn, f"[BATCH] Submitting {len(filings)} TinyFish runs simultaneously...", "info")

    # Build batch runs list (max 100 per API call)
    runs = []
    index_to_id = {}  # maps run index → filing id

    for filing in filings[:100]:
        form_type = filing.get("form_type", "8-K")
        goal = FORM_GOALS.get(form_type, FORM_GOALS["8-K"])
        ticker = filing.get("ticker", "")
        company = filing.get("company", "")

        # Prepend context to goal for better extraction
        context_prefix = ""
        if ticker or company:
            context_prefix = f"This is a {form_type} filing"
            if company:
                context_prefix += f" for {company}"
            if ticker:
                context_prefix += f" ({ticker})"
            context_prefix += ". "

        runs.append({
            "url": filing["url"],
            "goal": context_prefix + goal,
            "proxy_config": {"enabled": False},
        })
        index_to_id[len(runs) - 1] = filing["id"]

    # Step 1: Submit batch
    run_ids = []
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                f"{TINYFISH_API}/run-batch",
                headers={
                    "X-API-Key": api_key,
                    "Content-Type": "application/json",
                },
                json={"runs": runs},
            )

            if r.status_code != 200:
                _log(log_fn, f"[BATCH] Submit failed: HTTP {r.status_code} — {r.text[:200]}", "warning")
                return {}

            data = r.json()
            run_ids = data.get("run_ids", [])

            if not run_ids:
                _log(log_fn, f"[BATCH] No run_ids returned — response: {str(data)[:200]}", "warning")
                return {}

            _log(log_fn, f"[BATCH] Submitted — got {len(run_ids)} run IDs. Polling for results...", "info")

    except Exception as e:
        _log(log_fn, f"[BATCH] Submit error: {e}", "warning")
        return {}

    # Step 2: Poll all runs until complete or timed out
    # Determine per-run timeout based on form type
    results: dict[str, str] = {filing["id"]: "" for filing in filings}
    pending = {i: run_id for i, run_id in enumerate(run_ids) if i in index_to_id}
    max_wait_per_run = {
        i: MAX_WAIT.get(filings[i].get("form_type", ""), DEFAULT_MAX_WAIT)
        for i in pending
    }
    start_times = {i: asyncio.get_event_loop().time() for i in pending}
    completed = set()

    while pending:
        await asyncio.sleep(POLL_INTERVAL)

        # Check status for all still-pending run IDs
        still_pending = {}
        for idx, run_id in list(pending.items()):
            elapsed = asyncio.get_event_loop().time() - start_times[idx]
            max_t = max_wait_per_run[idx]

            if elapsed > max_t:
                filing_id = index_to_id[idx]
                form_type = filings[idx].get("form_type", "?") if idx < len(filings) else "?"
                _log(log_fn, f"[BATCH] Timeout ({max_t}s) for {form_type} run {run_id[:8]}", "warning")
                completed.add(idx)
                continue

            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    r = await client.get(
                        f"{TINYFISH_API}/runs/{run_id}",
                        headers={"X-API-Key": api_key},
                    )
                    if r.status_code != 200:
                        still_pending[idx] = run_id
                        continue

                    run_data = r.json()
                    status = run_data.get("status", "")

                    if status == "COMPLETED":
                        filing_id = index_to_id[idx]
                        form_type = filings[idx].get("form_type", "?") if idx < len(filings) else "?"

                        # Extract text from result
                        result_json = run_data.get("resultJson") or run_data.get("result") or {}
                        if isinstance(result_json, str):
                            try:
                                result_json = json.loads(result_json)
                            except Exception:
                                result_json = {"text": result_json}

                        text = ""
                        if isinstance(result_json, dict):
                            text = result_json.get("text", result_json.get("content", ""))
                        if not text and isinstance(result_json, str):
                            text = result_json

                        text = str(text).strip()
                        if text:
                            results[filing_id] = text
                            _log(log_fn, f"[BATCH] {form_type} complete — {len(text)} chars", "info")
                        else:
                            _log(log_fn, f"[BATCH] {form_type} completed but empty result", "warning")

                        completed.add(idx)

                    elif status in ("FAILED", "REJECTED", "ERROR", "CANCELLED"):
                        filing_id = index_to_id[idx]
                        form_type = filings[idx].get("form_type", "?") if idx < len(filings) else "?"
                        reason = run_data.get("error") or run_data.get("reason") or status
                        _log(log_fn, f"[BATCH] {form_type} {status}: {str(reason)[:80]}", "warning")
                        completed.add(idx)

                    else:
                        # Still running (PENDING, RUNNING, IN_PROGRESS, etc.)
                        still_pending[idx] = run_id

            except Exception as e:
                _log(log_fn, f"[BATCH] Poll error for run {run_id[:8]}: {e}", "warning")
                still_pending[idx] = run_id

        # Remove completed from pending
        pending = {i: r for i, r in still_pending.items() if i not in completed}

        if not pending:
            break

    done_count = sum(1 for v in results.values() if v)
    _log(log_fn, f"[BATCH] Done — {done_count}/{len(filings)} extractions successful", "info")
    return results


async def single_extract(
    url: str,
    form_type: str,
    ticker: str = "",
    company: str = "",
    log_fn=None,
) -> str:
    """
    Single-filing extraction via batch API (batch of 1).
    Use this instead of SSE for any individual form extraction.
    """
    results = await batch_extract_filings(
        filings=[{
            "id": "single",
            "url": url,
            "form_type": form_type,
            "ticker": ticker,
            "company": company,
        }],
        log_fn=log_fn,
    )
    return results.get("single", "")
