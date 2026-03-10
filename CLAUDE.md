# CLAUDE.md — AFI Codebase Context

This file gives Claude AI full context about the AFI codebase for autonomous code editing.

---

## What This Project Is

**AFI (Autonomous Filing Intelligence)** — A regulatory intelligence dashboard for retail investors. Monitors SEC EDGAR filings in real time, interprets them with Claude Sonnet AI, scores signals (Positive / Neutral / Risk), and delivers intelligence via dashboard + Telegram.

**Current Phase:** Phase 2 — Live EDGAR feed, Supabase database, AI classification, Telegram alerts, realtime dashboard.

---

## Architecture

```
FastAPI backend (port 8001) ← Supabase ← Supabase Auth
EDGAR Agent (background thread) → polls SEC EDGAR → Claude Sonnet → Supabase → Telegram
React frontend (port 3000) → Supabase Realtime + /api/* endpoints
```

All backend routes MUST be prefixed with `/api` (Kubernetes ingress routing requirement).

---

## Key Files

### Backend
- `/backend/server.py` — FastAPI app. Auth (Supabase), signals, watchlist, EDGAR control routes.
- `/backend/edgar_agent.py` — EDGAR 8-K polling agent. TinyFish/HTTP extraction, Claude Sonnet classification.
- `/backend/telegram_bot.py` — Telegram alert delivery. Formatted messages with signal emoji.
- `/backend/.env` — `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TINYFISH_API_KEY`, `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `USE_TINYFISH`, `TELEGRAM_ENABLED`, `CORS_ORIGINS`

### Frontend
- `/frontend/src/App.js` — Router. `ProtectedRoute` and `PublicOnlyRoute`.
- `/frontend/src/lib/supabase.js` — Supabase client singleton.
- `/frontend/src/context/AuthContext.jsx` — Supabase Auth state. `signInWithPassword`, `signUp` (via backend admin API), `onAuthStateChange`.
- `/frontend/src/pages/Landing.jsx` — Marketing page.
- `/frontend/src/pages/Auth.jsx` — Login/signup toggle.
- `/frontend/src/pages/Dashboard.jsx` — Protected. Alert feed, 60s polling, Supabase realtime subscriptions, agent status bar, signal detail modal.
- `/frontend/src/pages/Pricing.jsx` — Static 3-tier page.
- `/frontend/src/components/AlertCard.jsx` — Clickable signal card. Opens detail modal.
- `/frontend/src/components/SignalDetailModal.jsx` — Full signal detail overlay with EDGAR link.
- `/frontend/src/components/WatchlistPanel.jsx` — Right panel. Add/remove tickers.
- `/frontend/src/components/DashboardSidebar.jsx` — Left nav.

### Config
- `/frontend/tailwind.config.js` — `borderRadius: 0px` everywhere. Custom HSL color vars. Inter + JetBrains Mono fonts.
- `/frontend/src/index.css` — CSS vars for dark theme. Google Fonts import.
- `/memory/PRD.md` — Full product requirements and backlog.

---

## Data Models

### Signal (Supabase `signals` table)
```
id: UUID (auto-generated)
ticker: TEXT           # Always uppercase
filing_type: TEXT      # "8-K"
signal: TEXT           # "Positive" | "Neutral" | "Risk" | "Pending"
company: TEXT          # Full company name
summary: TEXT          # 1-sentence plain English
confidence: INTEGER    # 0-100
accession_number: TEXT # SEC accession number (unique)
filed_at: TIMESTAMPTZ
created_at: TIMESTAMPTZ
```

**API mapping:** The API returns `classification` (mapped from `signal`) and `company_name` (mapped from `company`) for frontend compatibility via `format_signal_for_api()` in `server.py`.

### User (Supabase Auth)
Managed by Supabase Auth. Backend uses `supabase.auth.admin.create_user()` for signup with `email_confirm: True`.

### Watchlist (Supabase `watchlist` table)
```
id: UUID (auto-generated)
user_id: UUID          # FK to auth.users
ticker: TEXT           # max 10 per user, uppercase
created_at: TIMESTAMPTZ
UNIQUE(user_id, ticker)
```

---

## Auth Flow

1. User signs up → backend `POST /api/auth/signup` → `supabase.auth.admin.create_user()` + `sign_in_with_password()` → JWT returned
2. Frontend `AuthContext` signs in via `supabase.auth.signInWithPassword()` → session stored by Supabase client
3. Protected requests → `Authorization: Bearer <supabase_access_token>` via `authHeaders()` from `AuthContext`
4. Backend validates token via `supabase.auth.get_user(token)`

---

## Design Rules (NEVER BREAK THESE)

| Rule | Value |
|------|-------|
| Background | `#050505` |
| Surface/card | `#0A0A0A` |
| Border | `border-zinc-800` (hover: `border-zinc-600`) |
| Accent | `#0066FF` (only for: primary buttons, active states, important links) |
| Positive signal | `#00C805` |
| Risk signal | `#FF3333` |
| Neutral signal | `#71717A` |
| Border radius | **0px everywhere** — use `rounded-none` on every element |
| Fonts | Inter for UI, JetBrains Mono for tickers/confidence/timestamps |
| Animations | **None** — transitions max 75ms, colors only |
| Gradients | **Forbidden** |

---

## Environment Variables

### Backend (`/backend/.env`)
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
TINYFISH_API_KEY=your-tinyfish-key
ANTHROPIC_API_KEY=your-anthropic-key    # Placeholder OK — agent stores Pending
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=@your_channel
USE_TINYFISH=true
TELEGRAM_ENABLED=true
CORS_ORIGINS=*
```

### Frontend (`/frontend/.env`)
```
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
REACT_APP_BACKEND_URL=http://localhost:8001
```

---

## Service Constraints

- Backend runs on `0.0.0.0:8001` — DO NOT change port
- Frontend runs on port `3000` — DO NOT change port
- All `/api/*` routes auto-proxy to backend via Kubernetes ingress
- Hot reload is active — no need to restart for code changes
- Restart required only when: changing `.env` files or installing new packages

---

## EDGAR Agent

- Polls SEC EDGAR EFTS every 5 minutes for 8-K filings
- Deduplicates via `accession_number` against Supabase
- TinyFish Web Agent API for text extraction (`USE_TINYFISH=true`)
- Falls back to direct HTTP when TinyFish is disabled
- Claude Sonnet (`claude-sonnet-4-20250514`) for classification
- Graceful handling: missing `ANTHROPIC_API_KEY` → `signal: "Pending"`, `confidence: 0`
- Control: `POST /api/edgar/start`, `POST /api/edgar/stop`, `GET /api/edgar/status`

---

## Telegram Bot

- Bot handle: `@tinyfishafi_bot`
- Sends alert on every new non-Pending signal
- Emoji: 🟢 Positive, ⚪ Neutral, 🔴 Risk
- `TELEGRAM_ENABLED=false` → silent skip
- All calls wrapped in try/except — never crashes

---

## Phase 2 Features (Implemented)

1. ✅ Supabase migration (auth + data)
2. ✅ EDGAR 8-K polling agent with AI classification
3. ✅ Telegram bot alerts
4. ✅ Dashboard realtime subscriptions (signals + watchlist)
5. ✅ Agent status bar (UP/DOWN badge, poll time, filings count)
6. ✅ Signal detail modal with EDGAR link

## Phase 3 Tasks (What to Build Next)

1. REST API access for Pro tier
2. Signal feedback loop (user votes on accuracy)
3. Market reaction correlation data
4. Stripe billing (Retail $19, Pro $99)

---

## Common Commands

```bash
# Start backend
cd backend && uvicorn server:app --reload --port 8001

# Start frontend
cd frontend && yarn start

# Start EDGAR agent
curl -X POST http://localhost:8001/api/edgar/start

# Stop EDGAR agent
curl -X POST http://localhost:8001/api/edgar/stop

# Check EDGAR agent status
curl http://localhost:8001/api/edgar/status

# Test Telegram bot
cd backend && python3 telegram_bot.py

# Install Python package
cd backend && pip install <package>

# Install JS package
cd frontend && yarn add <package>
```
