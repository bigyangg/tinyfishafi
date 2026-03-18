---
name: AFI Phase Status and Upgrade History
description: Current phase completion status and what was fixed in each upgrade session
type: project
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
