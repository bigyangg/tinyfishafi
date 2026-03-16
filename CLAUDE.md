# CLAUDE.md - AFI Architecture Reference

## Overview

AFI (Market Event Intelligence) is a real-time signal platform for traders. It polls SEC EDGAR continuously, detects new filings (8-K, 10-K, 10-Q, 4, SC 13D), classifies market events with Gemini 2.5 Flash, applies 5-stage governance validation, enriches with price data, scores impact (0–100), and delivers structured signals through a live dashboard, Telegram alerts, and server-sent events (SSE) logs.

**Current state:** Phase 7 Intelligence & Enrichment complete. Includes concurrent enrichment agents (news, social, insider, congress, divergence, genome), rigorous JSON governance to prevent AI hallucinations, real-time pipeline log streaming via SSE, and an updated frontend with 5-View Navigation (BRIEF, RADAR, INTEL, FEED, ALERTS) and Bloomberg-style Signal Cards.

---

## Architecture

```
FastAPI (port 8001) <-> Supabase (PostgreSQL + Auth + Realtime)
EDGAR Agent (120s loop) -> SEC EDGAR -> Multi-Form Pipeline -> Governance Validation -> Score -> Store -> Alert
Text Extraction: TinyFish -> SEC EFTS full-text -> HTTP scrape (follow_redirects)
Ticker Resolution: CIK -> data.sec.gov/submissions/CIK{padded}.json -> ticker
Signal Pipeline: Classify (Gemini) -> Taxonomy -> Enrich (Yahoo) -> Score -> Store -> Alert
Price Tracker (300s loop) -> Yahoo Finance -> price_correlations table
React (port 3000) -> Supabase Realtime + /api/* REST
```

All backend routes use the `/api/` prefix.

---

## Key Files

### Backend — Core
- `server.py` - FastAPI app. Signal/watchlist CRUD, SSE stream (`/api/logs/stream`), demo triggers (`/api/demo/trigger`, `/api/demo/trigger-all`), TinyFish stats, agent control. Auto-starts EDGAR agent and wires SSE queue to pipeline on boot. Wraps expensive synchronous AI workflows in `asyncio.to_thread` to maintain loop health.
- `edgar_agent.py` - Autonomous SEC poller. Multi-form support (8-K, 10-K, 10-Q, 4, SC 13D). **3-step extraction fallback** (TinyFish -> SEC EFTS -> HTTP scrape). Emits logs to SSE stream. delegates to SignalPipeline.
- `telegram_bot.py` - Smart Telegram alerts with multi-factor thresholds. Supports inline links without HTML symbol errors. Extracts and prints individual intelligence events directly in the chat body.

### Backend — Pipeline (Phase 7 Intelligence)
- `intelligence/enrichment_pipeline.py` - Core orchestrator for all enrichment agents. Runs Gemini-powered divergence analysis and updates signals with 20+ columns.
- `backend/agents/` - Directory containing `base_agent` (12s timeout, graceful failure, SSE streaming) and 6 enrichment agents (edgar, news, social, insider, congress, divergence, genome) running via `asyncio.gather` for simultaneous execution.
- `signal_pipeline.py` - Core orchestrator. Event-driven via Registry pattern: `register_processor(type, processor)`. Routes: Classify -> Governance -> Enrich -> Score -> Store.
- `processors/` - Contains multi-form Gemini prompts. `form_8k.py`, `form_10k.py`, `form_10q.py`, `form_4.py`, `form_sc13d.py`.
- `governance.py` - 5 validation checks: `CONFIDENCE_FLOOR`, `NEWS_DIVERGENCE`, `KEY_FACTS_PRESENT`, `EVENT_SIGNAL_CONSISTENCY`, `JUNK_FILTER`. Creates audit_trail JSON.
- `event_classifier.py` - Deterministic taxonomy mapper for legacy processing.
- `market_data.py` - Yahoo Finance wrapper. 5-minute TTL cache.
- `sentiment_analyzer.py` - Option A: filing signal vs current news tone. Keyword-based scoring. Returns delta, news score, match boolean.
- `impact_engine.py` - Rule-based composite scoring: 40% confidence + 30% event weight + 20% sentiment + 10% watchlist boost. `should_alert()` used by Telegram gate.
- `price_tracker.py` - Scheduled T+1h/T+24h/T+3d price checks. Database rows, not asyncio.sleep. Survives restarts.

### Frontend
- `App.js` - Client-side routing: `/`, `/dashboard`, `/watchlist`, `/signal/:id`, `/settings`, `/logs`, `/runs`.
- `AppShell.jsx` - Shared layout shell with sidebar navigation, agent status bar.
- `Dashboard.jsx` - Categorized feed. `CATEGORY_MAP` handles 7 groups. `CategorySection` accordion headers. **Instant rendering via localStorage cache**. Right sidebar includes the **Smart Demo Trigger panel**.
- `Runs.jsx` - High-level executive dashboard for tracking the results and yield of historical pipeline sweeps.
- `Logs.jsx` - Live terminal-like SSE viewer connecting to `/api/logs/stream`. Color coded by pipeline step for debugging.
- `Signal.jsx` - Deep-dive audit trail. Renders Chain of Thought, Key Facts, Governance checkboxes, Impact Score table, News Cross-Check, and Form Data grid. Fetches via `GET /api/signals/:id`.
- `Watchlist.jsx` - Watchlist management with inline filing expand. Clicking a filing opens `/signal/:id` in new tab.
- `Settings.jsx` - User settings page.
- `SignalSkeleton.jsx` - Shimmer loading placeholders (SignalSkeleton, StatsSkeleton, WatchlistSkeleton).
- `WatchlistPanel.jsx` - Ticker management via **backend proxy** (`/api/ticker/search`). Autocomplete dropdown.
- `SignalDetailModal.jsx` - Full signal detail overlay with **event type**, **impact score bar**, SEC EDGAR link.
- `DashboardSidebar.jsx` - Navigation with Sign Out + Telegram test.
- `hooks/usePushNotifications.js` - Browser notification hook. Requests permission, fires native notifications when tab not visible.
- `public/sw.js` - Service worker for background push notification events.
- `AuthContext.jsx` - Supabase Auth state.
- `lib/supabase.js` - Supabase client singleton.

### Environment Variables
**Backend (.env):** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TINYFISH_API_KEY`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `USE_TINYFISH`, `TELEGRAM_ENABLED`, `CORS_ORIGINS`, `RESEND_API_KEY` (optional), `DIGEST_EMAIL` (optional), `FRONTEND_URL` (optional)

**Frontend (.env):** `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`, `REACT_APP_BACKEND_URL`

---

## Data Model

### signals table
`id` (UUID), `ticker`, `company`, `filing_type` (8-K, 10-K, etc), `signal` (Positive/Neutral/Risk/Pending), `confidence` (INT 0-100), `summary`, `accession_number` (unique), `filed_at`, `created_at`
**Phase 6 Audit Columns:** `chain_of_thought` (JSONB), `governance_audit` (JSONB), `impact_breakdown` (JSONB), `news_headlines` (JSONB), `news_sentiment` (TEXT), `divergence_type` (TEXT), `key_facts` (JSONB), `form_data` (JSONB), `extraction_source` (TEXT), `extraction_time_ms` (INT).

API maps: `signal` -> `classification`, `company` -> `company_name` via `format_signal_for_api()`.

### watchlist table
`id` (UUID), `user_id` (UUID FK), `ticker`, `created_at`. UNIQUE(user_id, ticker). Max 10 per user.

### price_correlations table (Phase 3)
`id` (UUID), `signal_id` (FK), `ticker`, `price_at_filing`, `check_1h_at`/`check_24h_at`/`check_3d_at`, `price_1h`/`price_24h`/`price_3d`, `pct_change_1h`/`pct_change_24h`/`pct_change_3d`

### agent_config table (Phase 3)
`id` (UUID), `config_version` (INT), `tier1_tickers` (JSONB), `tier2_sectors` (JSONB), `pending_promotions` (JSONB), `settings` (JSONB), `updated_at`

---

## Design Rules (Non-Negotiable)

1. Background: `#050505`, Surface: `#0A0A0A`, Cards: `#0c0c0c`
2. Accent: `#0066FF` (interactive elements only)
3. Signals: Positive `#00C805`, Risk `#FF3333`, Neutral `#71717A`
4. Category colors: Earnings `#00C805`, Insider `#A855F7`, Activist `#0066FF`, Leadership `#FF6B00`, Annual `#F59E0B`, Legal `#FF3333`, Routine `#555`
5. Border radius: 4px (cards/buttons), 6px (accordion panels), 10px (count badges)
6. Fonts: Inter (UI), JetBrains Mono (tickers, numbers, timestamps)
7. Dark mode only. No gradients. Animations capped at 120ms.

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/health | System health + agent status |
| GET | /api/edgar/status | Agent polling state |
| POST | /api/edgar/start | Start agent |
| POST | /api/edgar/stop | Stop agent |
| POST | /api/auth/signup | Create account |
| POST | /api/auth/login | Authenticate |
| GET | /api/auth/me | Validate token |
| GET | /api/signals | All signals (filterable by tickers param) |
| POST | /api/signals/{id}/correct | Submit signal correction (Phase 3) |
| GET | /api/signals/{id}/correlation | Price correlation data (Phase 3) |
| GET | /api/watchlist | User watchlist |
| POST | /api/watchlist | Add ticker |
| DELETE | /api/watchlist/{ticker} | Remove ticker |
| GET | /api/brief | AI market intelligence summary (5-min server cache) |
| POST | /api/digest/send | Daily email digest (Resend) |
| POST | /api/telegram/test | Send test Telegram message |
| GET | /api/config | Agent config (Phase 3) |
| POST | /api/config | Update agent config (Phase 3) |
| GET | /api/ticker/search | Yahoo Finance ticker search proxy |
| POST | /api/demo/trigger | Single form-type demo pipeline trigger |
| POST | /api/demo/trigger-all | Smart trigger: all 6 form types + TG alerts |
| GET | /api/tinyfish/stats | TinyFish extraction statistics |
| GET | /api/signals/{id} | Full signal with audit trail |
| GET | /api/leaderboard/divergence | Divergence Leaderboard (deduplicated by ticker) |
| POST | /api/telegram/connect | Generate per-user Telegram verification code |
| DELETE | /api/telegram/disconnect | Disconnect per-user Telegram |
| GET | /api/telegram/status | Check if current user has Telegram connected |

---

## Pipeline Behavior (Phase 7 Intelligence)

- Filing received -> Enrichment pipeline triggers `asyncio.gather` with all 7 agents
- Step 1: `base_agent` retrieves initial form data with ~12s TinyFish Navigator pattern
- Step 2: Form-specific processor calls Gemini/Emergent Universal Key with chain-of-thought
- Step 2: event_classifier maps to taxonomy (deterministic, ~0ms)
- Step 3: governance.py runs 5 validation checks (confidence floor, news divergence, key facts, event consistency, junk filter)
- Step 4: market_data fetches price + news (cached, 2s timeout)
- Step 5: sentiment_analyzer compares filing vs news tone (~1ms)
- Step 6: impact_engine scores composite importance (0-100) with governance penalty
- Step 7: Store enriched signal + audit trail in Supabase
- Step 8: Schedule price checks (T+1h, T+24h, T+3d)
- Step 9: Alert via Telegram if impact >= threshold

Registry pattern: `pipeline.register_processor("4", Form4Processor())` — active for all 5 forms.

### Error Handling

Every pipeline step has isolated error handling with contextual logging:
- Classification failure (Step 2) → returns Pending signal with error type in summary
- Event classification failure (Step 3) → falls back to ROUTINE_ADMIN
- Market data failure (Step 4) → continues without price enrichment
- Sentiment failure (Step 5) → continues without sentiment data
- Impact scoring failure (Step 6) → continues without impact score
- Telegram failure → logged as non-fatal, signal still stored

Log format includes accession number, ticker, filing type, company name, and exception type for each failure mode.

---

## Roadmap

**Phase 2 (Complete):** Supabase migration, EDGAR agent, Gemini classification, Telegram alerts, real-time dashboard, health monitoring, AI brief.

**Phase 3 (Complete):** Signal pipeline, event taxonomy, market data enrichment (yfinance), sentiment analysis, impact scoring, price correlation tracking, config versioning, signal feedback loop, CIK-to-ticker resolution, SEC EFTS text extraction fallback, ticker search proxy, pipeline error handling.

**Phase 4 (Complete):** Smart Telegram thresholds (watchlist-aware, multi-factor), rich HTML alerts, browser push notifications (service worker + permission prompt), daily email digest endpoint (Resend), dashboard performance (parallel fetch, caching, skeleton UI), sidebar cleanup.

**Phase 5 (Complete):** Multi-page architecture (AppShell, Dashboard, Watchlist, Signal, Settings). Premium Landing Page redesign with CSS @keyframes, dot-grid background, glassmorphism, glowing lucide-react feature cards. Categorized feed with CATEGORY_MAP (event_type → groups: EARNINGS, LEADERSHIP, REGULATORY, ROUTINE). CategorySection accordion with SHOW/HIDE toggle, collapsed ticker previews, count badges. Compact 3-column AlertCard. Priority sorting (watched → signal → impact → date). Ghost/junk filtering. Polished right panel with bordered stat cards, mini signal cards, AI brief card. Watchlist page with inline filing expand. GET /api/signals/:id endpoint.

**Phase 6 (Complete):** Multi-form architecture: Form 4 insider processor (buy/sell), 10-K annual report processor, 10-Q quarterly earnings (beat/miss), SC 13D activist filing processor. 5-check governance validation with full audit trail. Chain-of-thought AI reasoning. Smart demo trigger (`trigger-all`) with live SSE logs and Telegram alerts. AlertCard intelligence (WHY line, NEWS DIVERGENCE badge, insider transaction details). 7-category feed. TinyFish stats endpoint. localStorage instant rendering. Gemini SDK migration to `google.genai`.

**Phase 7 (Complete):** Intelligence Agents & Enrichment pipeline. Built `backend/agents/` with 7 concurrent agents (base_agent, edgar, news, social, insider, congress, divergence, genome) using `asyncio.gather`. TinyFish Navigator-only pattern optimizations (~12s lookup + 200ms download). `intelligence/enrichment_pipeline.py` adds 20+ enrichment columns and Gemini divergence analysis. 5-View Navigation (BRIEF, RADAR, INTEL, FEED, ALERTS). Bloomberg-style Signal Cards (divergence, genome alert, 3px confidence bar). Emergent Universal Key fallback for AI classification. Telegram bot HTML fixes and Resend email service integration.

**Phase 8 (Complete):** Polish, Fix & Docs. S-1 IPO filing processor. `USE_TINYFISH` env guard on all agent calls. GenomeAgent as 7th enrichment agent with genome columns (score, trend, pattern_matches, alert). `/api/leaderboard/divergence` endpoint with ticker deduplication. Per-user Telegram: connect/disconnect/status endpoints, `dispatch_signal_alert()` with double-send prevention, `poll_telegram_commands()` background task. `SignalDetailModal.jsx` rewritten with divergence, genome, social, insider, congress, and news enrichment sections. Test files: `test_form_s1.py`, `test_leaderboard.py`. `S-1` added to trigger-all sweep forms.
