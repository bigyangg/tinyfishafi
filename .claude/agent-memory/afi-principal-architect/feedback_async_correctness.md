---
name: Async correctness patterns in AFI backend
description: Patterns and anti-patterns for async/sync boundaries in the FastAPI backend
type: feedback
---

Always wrap Supabase client calls in `asyncio.to_thread()` when called from async context. The Supabase Python client (`supabase-py`) is synchronous — calling it directly inside `async def` functions blocks the event loop.

**Why:** Discovered multiple blocking calls in server.py:
- `get_current_user()` dependency called `supabase.auth.get_user()` synchronously on every authenticated request — this blocks the event loop for every API call
- `cleanup_seed_data()` and `run_schema_migration()` called synchronous Supabase methods at startup in async context

**How to apply:**
- When reviewing or writing any `async def` function in server.py, check every line that calls `supabase.*` — wrap in `asyncio.to_thread(callable, *args)` or refactor to a `def _sync_fn(): ...` helper then `await asyncio.to_thread(_sync_fn)`
- Exception: `asyncio.create_task(...)` calls that schedule coroutines are fine
- Exception: Pure in-memory operations (dicts, sets, string ops) are fine without threading
- The `edgar_agent.py` and pipeline code already use `asyncio.to_thread` for blocking work — use that pattern as reference
