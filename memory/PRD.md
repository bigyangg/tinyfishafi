# AFI v3.0 — Product Requirements Document

## Original Problem Statement
AFI (Autonomous Filing Intelligence) v3.0 upgrade — a real-time SEC EDGAR filing intelligence platform. Phase 2 architecture overhaul to add 7 TinyFish agents, enrichment pipeline, divergence detection, genome engine, 5-view navigation, and notification improvements.

## Architecture
- **Backend**: FastAPI (Python 3.11) + Supabase (PostgreSQL + Realtime)
- **Frontend**: React 19 + Tailwind CSS + JetBrains Mono
- **AI**: Google Gemini 2.5 Flash via Emergent Universal Key
- **Web Agents**: TinyFish Web Agent API (7 agents)
- **Email**: Resend SDK
- **Notifications**: Telegram Bot (HTML parse mode)

## User Personas
1. **Active Trader** — Monitors SEC filings in real-time for trading signals
2. **Research Analyst** — Uses company dossier/INTEL view for deep analysis
3. **Compliance Officer** — Monitors divergence detection and genome alerts

## What's Been Implemented (2026-03-16)

### Phase 2 / v3 Complete
- Fixed TinyFish to navigator-only (finds URLs, backend downloads docs via HTTP)
- Built 7-agent infrastructure (edgar, news, social, insider, congress, divergence, genome)
- Built enrichment pipeline orchestrator with asyncio.gather
- Wired enrichment pipeline into EDGAR poller
- Built Regulatory Genome Engine with 4 crisis pattern templates
- Updated all 5 processors to use Emergent LLM key
- Rebuilt Navigation: 5 views (BRIEF, RADAR, INTEL, FEED, ALERTS)
- Upgraded AlertCard: Bloomberg-terminal style with divergence/genome/social rows
- Fixed Telegram bot (HTML parse), added Resend email service
- Added 8 new API endpoints (telegram/setup, email/test, genomes, intel, radar, migrate)

### Testing: 100% pass rate (backend + frontend)

## P0 — User Action Required
- Run migration SQL at /api/migrate in Supabase SQL Editor
- Add API keys: GEMINI_API_KEY, RESEND_API_KEY, TELEGRAM_CHAT_ID

## P1 — Next Phase
- S-1 IPO support, REST API gateway, Stripe billing, Claude Sonnet migration
