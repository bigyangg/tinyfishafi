# CLAUDE.md - AFI Architecture Reference

## Overview

AFI (Market Event Intelligence) is a real-time signal platform for traders. It polls SEC EDGAR for 8-K filings, classifies market events with Google Gemini 2.5 Flash, enriches with price data and news sentiment, scores impact (0–100), and delivers structured signals through a live dashboard and Telegram alerts.

**Current state:** Phase 3 complete. Full enrichment pipeline with 3-step text extraction fallback, CIK-to-ticker resolution, event taxonomy, impact scoring, price correlation tracking, configurable Telegram threshold, and signal feedback loop.

---

## Architecture

```
FastAPI (port 8001) <-> Supabase (PostgreSQL + Auth + Realtime)
EDGAR Agent (120s loop) -> SEC EDGAR -> Signal Pipeline -> Supabase -> Telegram
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
- `server.py` - FastAPI app. Auth, signal/watchlist CRUD, agent control, config management, signal correction endpoint, price correlation endpoint, **ticker search proxy** (`/api/ticker/search`). Auto-starts EDGAR agent on boot.
- `edgar_agent.py` - Autonomous 8-K poller. 120-second interval. **3-step text extraction fallback** (TinyFish -> SEC EFTS -> HTTP scrape). **CIK-to-ticker resolution** via SEC submissions API. Delegates to SignalPipeline. Configurable Telegram threshold (`TELEGRAM_IMPACT_THRESHOLD`). Integrates price tracker.
- `telegram_bot.py` - HTML-formatted alerts via Telegram Bot API. Only fires when `impact >= TELEGRAM_IMPACT_THRESHOLD` (default 40). Includes `send_test_message()`.

### Backend — Pipeline (Phase 3)
- `signal_pipeline.py` - Core orchestrator. Registry pattern: `register_processor(type, processor)`. Routes: Classify -> Taxonomy -> Enrich -> Score -> Store. `EightKProcessor` uses Gemini. **Per-step error handling** with context logging (accession, filing type, company). New filing types plug in via one new class + registration.
- `event_classifier.py` - Deterministic taxonomy mapper. Maps Gemini output to fixed event types (EARNINGS_BEAT, EXEC_DEPARTURE, etc.). Extracts 8-K item numbers. No API calls.
- `market_data.py` - Yahoo Finance (yfinance) wrapper. 5-minute TTL in-memory cache for prices and news. 2s timeout. Returns None on failure.
- `sentiment_analyzer.py` - Option A: filing signal vs current news tone. Keyword-based scoring. Returns delta, news score, match boolean.
- `impact_engine.py` - Rule-based composite scoring: 40% confidence + 30% event weight + 20% sentiment + 10% watchlist boost. `should_alert()` used by Telegram gate.
- `price_tracker.py` - Scheduled T+1h/T+24h/T+3d price checks. Database rows, not asyncio.sleep. Survives restarts.

### Frontend
- `Dashboard.jsx` - Real-time alert feed. Health check polling (30s). Agent status bar. AI brief panel with **live age counter**. Watchlist quick-add via AlertCard props.
- `AlertCard.jsx` - Signal card with confidence bar (green/amber/red), **impact bar**, **event type badge**, **★ watchlist quick-add button**, hover affordance, slideDown animation.
- `WatchlistPanel.jsx` - Ticker management via **backend proxy** (`/api/ticker/search`). Autocomplete dropdown.
- `SignalDetailModal.jsx` - Full signal detail overlay with **event type**, **impact score bar**, SEC EDGAR link.
- `DashboardSidebar.jsx` - Navigation with "Test Telegram" button.
- `AuthContext.jsx` - Supabase Auth state.
- `lib/supabase.js` - Supabase client singleton.

### Environment Variables
**Backend (.env):** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TINYFISH_API_KEY`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `USE_TINYFISH`, `TELEGRAM_ENABLED`, `TELEGRAM_IMPACT_THRESHOLD` (default 40), `CORS_ORIGINS`

**Frontend (.env):** `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`, `REACT_APP_BACKEND_URL`

---

## Data Model

### signals table
`id` (UUID), `ticker`, `company`, `filing_type`, `signal` (Positive/Neutral/Risk/Pending), `confidence` (INT 0-100), `summary`, `accession_number` (unique), `filed_at`, `created_at`
**Phase 3 columns:** `event_type`, `filing_subtype`, `sentiment_delta` (REAL), `news_sentiment_score` (REAL), `sentiment_match` (BOOL), `impact_score` (INT), `user_correction`, `correction_count` (INT), `config_version_at_classification` (INT)

API maps: `signal` -> `classification`, `company` -> `company_name` via `format_signal_for_api()`.

### watchlist table
`id` (UUID), `user_id` (UUID FK), `ticker`, `created_at`. UNIQUE(user_id, ticker). Max 10 per user.

### price_correlations table (Phase 3)
`id` (UUID), `signal_id` (FK), `ticker`, `price_at_filing`, `check_1h_at`/`check_24h_at`/`check_3d_at`, `price_1h`/`price_24h`/`price_3d`, `pct_change_1h`/`pct_change_24h`/`pct_change_3d`

### agent_config table (Phase 3)
`id` (UUID), `config_version` (INT), `tier1_tickers` (JSONB), `tier2_sectors` (JSONB), `pending_promotions` (JSONB), `settings` (JSONB), `updated_at`

---

## Design Rules (Non-Negotiable)

1. Background: `#050505`, Surface: `#0A0A0A`
2. Accent: `#0066FF` (interactive elements only)
3. Signals: Positive `#00C805`, Risk `#FF3333`, Neutral `#71717A`
4. Border radius: 0px everywhere
5. Fonts: Inter (UI), JetBrains Mono (tickers, numbers, timestamps)
6. Dark mode only. No gradients. Animations capped at 75ms.

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
| GET | /api/brief | AI market intelligence summary |
| POST | /api/telegram/test | Send test Telegram message |
| GET | /api/config | Agent config (Phase 3) |
| POST | /api/config | Update agent config (Phase 3) |
| GET | /api/ticker/search | Yahoo Finance ticker search proxy |

---

## Pipeline Behavior (Phase 3)

- Filing received -> SignalPipeline.process() orchestrates all steps
- Step 1: EightKProcessor.classify() calls Gemini 2.5 Flash
- Step 2: event_classifier maps to taxonomy (deterministic, ~0ms)
- Step 3: market_data fetches price + news (cached, 2s timeout)
- Step 4: sentiment_analyzer compares filing vs news tone (~1ms)
- Step 5: impact_engine scores composite importance (0-100)
- Step 6: Store enriched signal in Supabase
- Step 7: Schedule price checks (T+1h, T+24h, T+3d)
- Step 8: Alert via Telegram if impact >= threshold

Registry pattern: `pipeline.register_processor("4", Form4Parser())` to add Form 4 support later.

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

**Phase 3 (Complete):** Signal pipeline, event taxonomy, market data enrichment (yfinance), sentiment analysis, impact scoring, price correlation tracking, config versioning, signal feedback loop, CIK-to-ticker resolution, SEC EFTS text extraction fallback, configurable Telegram threshold, ticker search proxy, pipeline error handling.

**Phase 4 (Planned):** Form 4 XML parser, 10-K/10-Q section extractor, 13D materiality filter, Pro-tier REST API, Stripe billing, email notifications (Resend).
