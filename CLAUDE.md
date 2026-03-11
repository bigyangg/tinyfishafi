# CLAUDE.md - AFI Architecture Reference

## Overview

AFI (Market Event Intelligence) is a real-time signal platform for traders. It polls SEC EDGAR for 8-K filings, classifies market events with Google Gemini 2.5 Flash, enriches with price data and news sentiment, scores impact (0–100), and delivers structured signals through a live dashboard, Telegram alerts, browser push notifications, and email digests.

**Current state:** Phase 5 complete. Categorized feed with accordion sections (EARNINGS, LEADERSHIP, REGULATORY, ROUTINE), multi-page architecture (AppShell, Dashboard, Watchlist, Signal, Settings), compact 3-column AlertCard, polished right panel with bordered cards, and FeedSummaryBar with category pills.

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
- `telegram_bot.py` - Smart Telegram alerts. `should_send_telegram()` with multi-factor thresholds: always alerts watchlist tickers, confidence >= 60 for Positive/Risk, impact >= 55. Rich HTML format with company name, event labels, EDGAR links. `send_signal_alert(data, is_watched)` adds watched indicator.

### Backend — Pipeline (Phase 3)
- `signal_pipeline.py` - Core orchestrator. Registry pattern: `register_processor(type, processor)`. Routes: Classify -> Taxonomy -> Enrich -> Score -> Store. `EightKProcessor` uses Gemini. **Per-step error handling** with context logging (accession, filing type, company). New filing types plug in via one new class + registration.
- `event_classifier.py` - Deterministic taxonomy mapper. Maps Gemini output to fixed event types (EARNINGS_BEAT, EXEC_DEPARTURE, etc.). Extracts 8-K item numbers. No API calls.
- `market_data.py` - Yahoo Finance (yfinance) wrapper. 5-minute TTL in-memory cache for prices and news. 2s timeout. Returns None on failure.
- `sentiment_analyzer.py` - Option A: filing signal vs current news tone. Keyword-based scoring. Returns delta, news score, match boolean.
- `impact_engine.py` - Rule-based composite scoring: 40% confidence + 30% event weight + 20% sentiment + 10% watchlist boost. `should_alert()` used by Telegram gate.
- `price_tracker.py` - Scheduled T+1h/T+24h/T+3d price checks. Database rows, not asyncio.sleep. Survives restarts.

### Frontend
- `App.js` - Client-side routing: `/`, `/dashboard`, `/watchlist`, `/signal/:id`, `/settings`.
- `AppShell.jsx` - Shared layout shell with sidebar navigation and agent status bar.
- `Dashboard.jsx` - Categorized signal feed. `CATEGORY_MAP` groups signals into EARNINGS & FINANCIAL, LEADERSHIP & CORP EVENTS, REGULATORY & LEGAL, ROUTINE FILINGS. `CategorySection` accordion with sticky headers, SHOW/HIDE toggle, collapsed ticker previews, and count badges. `FeedSummaryBar` with category pills in header. Priority sorting: watched → signal type → impact → date. Ghost/junk filtering. Right panel: `TodayStats` (bordered cards), `TopSignals` (mini-cards with colored borders and impact-colored scores), `MarketBrief` (AI summary in bordered card), `WatchlistZone`.
- `AlertCard.jsx` - Compact 3-column grid card: ticker+event | summary+company | time+watch+impact bar. Supports `dimmed` prop for routine filings. 4px border-radius, visible borders.
- `Watchlist.jsx` - Watchlist management with inline filing expand. Clicking a filing opens `/signal/:id` in new tab.
- `Signal.jsx` - Individual signal detail page. Fetches via `GET /api/signals/:id`.
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

1. Background: `#050505`, Surface: `#0A0A0A`, Cards: `#0c0c0c`
2. Accent: `#0066FF` (interactive elements only)
3. Signals: Positive `#00C805`, Risk `#FF3333`, Neutral `#71717A`
4. Category colors: Earnings `#00C805`, Leadership `#FF6B00`, Legal `#FF3333`, Routine `#555`
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

**Phase 3 (Complete):** Signal pipeline, event taxonomy, market data enrichment (yfinance), sentiment analysis, impact scoring, price correlation tracking, config versioning, signal feedback loop, CIK-to-ticker resolution, SEC EFTS text extraction fallback, ticker search proxy, pipeline error handling.

**Phase 4 (Complete):** Smart Telegram thresholds (watchlist-aware, multi-factor), rich HTML alerts, browser push notifications (service worker + permission prompt), daily email digest endpoint (Resend), dashboard performance (parallel fetch, caching, skeleton UI), sidebar cleanup.

**Phase 5 (Complete):** Multi-page architecture (AppShell, Dashboard, Watchlist, Signal, Settings). Premium Landing Page redesign with CSS @keyframes, dot-grid background, glassmorphism, glowing lucide-react feature cards. Categorized feed with CATEGORY_MAP (event_type → groups: EARNINGS, LEADERSHIP, REGULATORY, ROUTINE). CategorySection accordion with SHOW/HIDE toggle, collapsed ticker previews, count badges. Compact 3-column AlertCard. Priority sorting (watched → signal → impact → date). Ghost/junk filtering. Polished right panel with bordered stat cards, mini signal cards, AI brief card. Watchlist page with inline filing expand. GET /api/signals/:id endpoint.

**Phase 6 (Planned):** Form 4 XML parser, 10-K/10-Q section extractor, 13D materiality filter, per-user Telegram chat IDs, Pro-tier REST API, Stripe billing.
