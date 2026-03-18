# AFI Principal Architect — Memory Index

## Project State
- [project_phase_status.md](./project_phase_status.md) — Phase 8 complete; full bug list from 2026-03-18 audit session

## Feedback — Backend
- [feedback_async_correctness.md](./feedback_async_correctness.md) — Supabase client is synchronous; always wrap in asyncio.to_thread in async context
- [feedback_graph_node_safety.md](./feedback_graph_node_safety.md) — react-force-graph-2d "node not found" prevention pattern

## Feedback — Frontend
- [feedback_frontend_auth_flicker.md](./feedback_frontend_auth_flicker.md) — Never render null during auth loading; use stable loading state
- [feedback_design_system.md](./feedback_design_system.md) — Common design violations: invisible text colors, gradient rule, active nav, overflow
