---
name: AFI Phase Status and Upgrade History
description: Current phase completion status and what was fixed in each upgrade session
type: project
---

AFI is at Phase 10 Complete as of 2026-03-18. Phase 11 maintenance fixes applied 2026-03-19.

## Phase 11 fixes (2026-03-19)

- `_poll_edgar` now queries last 3 days (three_days_ago) instead of today only; filing cap raised 20→50
- Dedup in `_process_filing`: selects confidence, only skips if conf>0; deletes conf=0 stale rows and retries
- `backfill_recent_filings` async function added to `edgar_agent.py` at module level
- `POST /api/edgar/backfill` endpoint added to `server.py`; `BackgroundTasks` added to fastapi imports
- `/api/correlations/graph` fully replaced: imports COMPETITORS/SUPPLY_CHAIN/TICKER_SECTOR from correlation_engine, builds nodes from TICKER_SECTOR, adds competitor/supply_chain/customer/peer links, returns both `links` and `edges` keys; uses `@app.get` decorator (not api_router) to avoid double prefix
- `frontend/src/pages/Radar.jsx` created (uses useAppData, week buckets, mini signal cards)
- `Dashboard.jsx` RADAR view now uses `<Radar />` from pages/ instead of `<RadarView />` from components/views/
- `Graph.jsx`: data fetch reads `data.links || data.edges`; includes ALL nodes; SECTOR_POSITIONS + handleEngineStart cluster force added; getLinkColor/getLinkWidth callbacks with sectorFilter + link.type awareness; physics tuned (alphaDecay=0.015, velocityDecay=0.25, warmupTicks=100, cooldownTime=4000)

---

AFI is at Phase 8 Complete as of 2026-03-18. A production-grade audit and fix pass was completed covering all system layers.

**Why:** User reported flicker/blank screen on page navigation, Graph "node not found" errors, broken UI layout, and need for premium landing page quality.

**How to apply:** When planning future phases, start from Phase 9. All bugs from this session are resolved.

## Bugs fixed in 2026-03-18 upgrade session

### Frontend — Critical
- **Auth loading flicker (root cause)**: `AuthContext.jsx` rendered `null` while `loading=true` via `{!loading && children}`. Every page load showed a blank screen for ~200-500ms while `supabase.auth.getSession()` resolved. Fixed by rendering a full-screen AFI logo + animated scan-line loading state during auth initialization.
- **Route guard flicker**: `ProtectedRoute` and `PublicOnlyRoute` in `App.js` did not check `loading` state, causing potential redirect flash. Fixed by adding `if (loading) return null` guard.
- **AppShell Signal Trigger wrong endpoint**: `fireTrigger` called `/api/trigger-all` instead of `/api/demo/trigger-all`. Fixed.
- **Sidebar invisible nav items**: Nav items used `color: '#2a2a2a'` on `#050505` background — effectively invisible. Fixed to `#444`. Active items now use `#0066FF` accent border instead of white.
- **Sidebar invisible dividers**: Multiple `borderRight: '1px solid #0a0a0a'` borders were invisible (same as background). Fixed to `#111`.
- **User email invisible**: Bottom account section used `#2a2a2a` text color. Fixed to `#555`.

### Frontend — Graph
- **"node not found" error**: Graph.jsx added `nodeIdSet` guard — links are now filtered before mapping so only edges where BOTH source AND target exist in `data.nodes` are included. Backend `correlation_engine.py` also already patched to skip non-existent nodes in supply chain edges.
- **Graph empty state**: Added empty state message + "SHOW ALL" button when sector filter produces zero visible nodes.

### Frontend — Landing
- **Page not scrollable**: Root div had `overflow: "hidden"` — changed to `overflowX: "hidden", overflowY: "auto"`.
- **Background color inconsistency**: Was `#030303`, changed to `#050505` to match design system.
- **Gradient text violation**: "Lying." and "Start Knowing." used `linear-gradient` with `WebkitTextFillColor: "transparent"` — replaced with solid `#0066FF` per design rules (no gradients).

### Backend — Async correctness
- **`cleanup_seed_data()` blocking event loop**: Called synchronous Supabase client inside `async def` at startup. Wrapped in `asyncio.to_thread(_do_cleanup)`. Also upgraded from row-by-row delete to batch `in_` filter.
- **`run_schema_migration()` blocking**: Two synchronous Supabase `SELECT` calls in async context at startup. Wrapped in `asyncio.to_thread(_check_tables)`.
- **`get_current_user()` blocking**: `supabase.auth.get_user(token)` called synchronously inside async dependency — runs on every authenticated request. Wrapped in `asyncio.to_thread`.
