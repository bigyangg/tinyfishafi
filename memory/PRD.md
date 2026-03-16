# AFI v3.0 — Product Requirements Document

## Original Problem Statement
AFI (Autonomous Filing Intelligence) v3.0 — Complete architecture upgrade + premium landing page redesign.

## Architecture
- **Backend**: FastAPI (Python 3.11) + Supabase (PostgreSQL + Realtime)
- **Frontend**: React 19 + JetBrains Mono + Inter
- **AI**: Gemini 2.5 Flash via Emergent Universal Key
- **Web Agents**: TinyFish Web Agent API (7 agents)
- **Email**: Resend SDK | **Notifications**: Telegram Bot (HTML)

## What's Been Implemented (2026-03-16)

### v3 Backend (All Steps Complete)
- Fixed TinyFish to navigator-only (finds URLs, backend downloads docs)
- Built 7-agent infrastructure (edgar, news, social, insider, congress, divergence, genome)
- Built enrichment pipeline orchestrator with asyncio.gather
- Wired enrichment into EDGAR poller (background thread)
- Regulatory Genome Engine with 4 crisis patterns
- Updated all 5 processors to use Emergent LLM key
- 8 new API endpoints (telegram/setup, email/test, genomes, intel, radar, migrate, genome backfill)

### v3 Frontend (All Steps Complete)
- **Premium Landing Page**: Scroll-driven parallax, live real-time signal ribbon from backend API, 5-column Intelligence Pipeline (DETECT/EXTRACT/CLASSIFY/ENRICH/ALERT), Divergence Detection showcase with live cards, 7-agent grid, gradient CTA
- **5-View Dashboard**: BRIEF (AI daily brief), RADAR (weekly calendar), INTEL (company dossier), FEED (enriched signals), ALERTS (notification control)
- **Bloomberg-style Signal Cards**: Divergence/genome/social/insider/congress rows, 3px confidence bar, relative timestamps

### Testing: 100% pass rate (backend + frontend) — Iteration 3

## P0 — User Action Required
- Run migration SQL at /api/migrate in Supabase SQL Editor
- Add API keys: RESEND_API_KEY, TELEGRAM_CHAT_ID

## P1 — Next Phase
- S-1 IPO support, Stripe billing, Claude Sonnet migration, per-user alerts
