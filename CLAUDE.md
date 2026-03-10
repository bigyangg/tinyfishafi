# CLAUDE.md - AFI Architecture Reference

## Overview

AFI (Autonomous Filing Intelligence) is a regulatory intelligence dashboard for traders. It polls SEC EDGAR for 8-K filings, classifies them with Google Gemini 2.5 Flash, and delivers real-time signals through a web dashboard and Telegram alerts.

**Current state:** Phase 2 complete. Live autonomous feed, Supabase storage, Gemini classification, real-time WebSocket updates, Telegram alerting.

---

## Architecture

```
FastAPI (port 8001) <-> Supabase (PostgreSQL + Auth + Realtime)
EDGAR Agent (120s loop) -> SEC EDGAR -> Gemini 2.5 Flash -> Supabase -> Telegram
React (port 3000) -> Supabase Realtime + /api/* REST
```

All backend routes use the `/api/` prefix.

---

## Key Files

### Backend
- `server.py` - FastAPI app. Auth delegation to Supabase, signal/watchlist CRUD, agent control, health check, AI brief endpoint, Telegram test endpoint. Auto-starts EDGAR agent on boot. Cleans seed data on startup.
- `edgar_agent.py` - Autonomous 8-K poller. 120-second interval. Extracts text via TinyFish (HTTP fallback). Classifies with Gemini 2.5 Flash. Granular error handling at every step. Logs tagged: `[POLL]`, `[PROCESS]`, `[EXTRACT]`, `[CLASSIFY]`, `[STORE]`, `[TELEGRAM]`.
- `telegram_bot.py` - Sends formatted alerts via Telegram Bot API. Handles errors without crashing. Includes `send_test_message()` for verification.

### Frontend
- `Dashboard.jsx` - Real-time alert feed. Health check polling (30s). Agent status bar with pulsing indicators and countdown timer. AI brief panel. New signal slide-in animation. Relative timestamps.
- `AlertCard.jsx` - Signal card with confidence bar (green/amber/red), hover chevron affordance, relative timestamps.
- `WatchlistPanel.jsx` - Ticker management with smart empty-state prompt.
- `DashboardSidebar.jsx` - Navigation with "Test Telegram" button.
- `AuthContext.jsx` - Supabase Auth state. Signup through backend admin API, then client-side sign-in.
- `lib/supabase.js` - Supabase client singleton.

### Environment Variables
**Backend (.env):** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TINYFISH_API_KEY`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `USE_TINYFISH`, `TELEGRAM_ENABLED`, `CORS_ORIGINS`

**Frontend (.env):** `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`, `REACT_APP_BACKEND_URL`

---

## Data Model

### signals table
`id` (UUID), `ticker` (TEXT), `company` (TEXT), `filing_type` (TEXT), `signal` (TEXT: Positive/Neutral/Risk/Pending), `confidence` (INT 0-100), `summary` (TEXT), `accession_number` (TEXT unique), `filed_at` (TIMESTAMPTZ), `created_at` (TIMESTAMPTZ)

API maps: `signal` -> `classification`, `company` -> `company_name` via `format_signal_for_api()`.

### watchlist table
`id` (UUID), `user_id` (UUID FK), `ticker` (TEXT), `created_at` (TIMESTAMPTZ). UNIQUE(user_id, ticker). Max 10 per user.

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
| GET | /api/watchlist | User watchlist |
| POST | /api/watchlist | Add ticker |
| DELETE | /api/watchlist/{ticker} | Remove ticker |
| GET | /api/brief | AI market intelligence summary |
| POST | /api/telegram/test | Send test Telegram message |

---

## Agent Behavior

- Auto-starts on server boot (no manual trigger needed)
- Polls EDGAR EFTS every 120 seconds for today's 8-K filings
- Deduplicates via `accession_number` before processing
- TinyFish extraction with HTTP fallback
- Gemini 2.5 Flash classification returning deterministic JSON
- Missing API key: stores as Pending with confidence 0
- Individual filing failures never stop the poll loop
- Telegram alerts sent for non-Pending signals only

---

## Roadmap

**Phase 2 (Complete):** Supabase migration, EDGAR agent, Gemini classification, Telegram alerts, real-time dashboard, health monitoring, AI brief.

**Phase 3 (Planned):** Pro-tier REST API, user feedback loop, signal-price correlation, Stripe billing.

**Phase 4 (Planned):** 10-K/10-Q/S-1 support, white-label API, international filings.
