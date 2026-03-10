# AFI — Autonomous Filing Intelligence

> AI That Reads SEC Filings So You Don't Have To.

AFI is a regulatory intelligence dashboard for retail investors. It monitors SEC EDGAR filings in real time, interprets them with AI (Claude Sonnet), scores the signal, and delivers structured intelligence via dashboard and Telegram before the news cycle picks it up.

---

## Tech Stack

| Layer | Technology |
|-------|-----------:|
| Frontend | React 19, React Router v7, Tailwind CSS |
| Backend | FastAPI (Python 3.11) |
| Database | Supabase (PostgreSQL + Realtime) |
| Auth | Supabase Auth (email + password) |
| AI | Claude Sonnet (claude-sonnet-4-20250514) via Anthropic SDK |
| Web Agent | TinyFish Web Agent API |
| Alerts | Telegram Bot API |
| Fonts | Inter + JetBrains Mono (Google Fonts) |
| Icons | Lucide React |

---

## Project Structure

```
/
├── backend/
│   ├── server.py            # FastAPI app — auth, signals, watchlist, EDGAR control
│   ├── edgar_agent.py       # EDGAR 8-K polling + AI classification agent
│   ├── telegram_bot.py      # Telegram alert delivery
│   ├── requirements.txt     # Python dependencies
│   └── .env                 # Supabase, TinyFish, Anthropic, Telegram credentials
├── frontend/
│   ├── src/
│   │   ├── App.js                        # Router + protected routes
│   │   ├── lib/supabase.js              # Supabase client singleton
│   │   ├── context/AuthContext.jsx       # Supabase auth state
│   │   ├── pages/
│   │   │   ├── Landing.jsx               # Marketing landing page
│   │   │   ├── Auth.jsx                  # Login / signup form
│   │   │   ├── Dashboard.jsx             # Alert feed + realtime + agent status
│   │   │   └── Pricing.jsx               # 3-tier pricing page
│   │   └── components/
│   │       ├── AlertCard.jsx             # Clickable signal card
│   │       ├── SignalDetailModal.jsx     # Full signal detail overlay
│   │       ├── WatchlistPanel.jsx        # Watchlist add/remove UI
│   │       └── DashboardSidebar.jsx      # Nav sidebar
│   ├── tailwind.config.js                # 0px radius, dark theme, custom fonts
│   └── .env                              # Supabase URL + anon key
├── memory/
│   └── PRD.md               # Full product requirements document
├── CLAUDE.md                # AI context file
└── README.md
```

---

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Create account via Supabase Auth → returns JWT |
| POST | `/api/auth/login` | Login via Supabase Auth → returns JWT |
| GET | `/api/auth/me` | Current user (requires `Authorization: Bearer <token>`) |

### Signals
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/signals` | All signals from Supabase (ordered by `filed_at` desc) |
| GET | `/api/signals?tickers=AAPL,NVDA` | Filtered by tickers |

### Watchlist (requires auth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/watchlist` | Get user's watchlist |
| POST | `/api/watchlist` | Add ticker `{ "ticker": "AAPL" }` |
| DELETE | `/api/watchlist/{ticker}` | Remove ticker |

### EDGAR Agent
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/edgar/status` | Returns `last_poll_time`, `filings_processed_today`, `agent_status` |
| POST | `/api/edgar/start` | Starts EDGAR polling loop (every 5 min) |
| POST | `/api/edgar/stop` | Stops polling loop |

---

## Seed Data

10 realistic SEC 8-K filings seeded into Supabase `signals` table:

| Ticker | Company | Signal | Confidence |
|--------|---------|--------|------------|
| NVDA | NVIDIA Corporation | Positive | 91% |
| BA | The Boeing Company | Risk | 88% |
| AAPL | Apple Inc. | Positive | 85% |
| NFLX | Netflix, Inc. | Risk | 79% |
| MSFT | Microsoft Corporation | Positive | 83% |
| META | Meta Platforms, Inc. | Neutral | 72% |
| JPM | JPMorgan Chase & Co. | Risk | 86% |
| TSLA | Tesla, Inc. | Neutral | 68% |
| AMZN | Amazon.com, Inc. | Positive | 87% |
| GOOGL | Alphabet Inc. | Risk | 84% |

---

## Local Development

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --reload --port 8001
```

### Frontend
```bash
cd frontend
yarn install
yarn start
```

### Environment Variables

**backend/.env**
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
TINYFISH_API_KEY=your-tinyfish-key
ANTHROPIC_API_KEY=your-anthropic-key
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=@your_bot_or_channel
USE_TINYFISH=true
TELEGRAM_ENABLED=true
CORS_ORIGINS=*
```

**frontend/.env**
```
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
REACT_APP_BACKEND_URL=http://localhost:8001
```

---

## EDGAR Agent

The EDGAR agent polls SEC EDGAR every 5 minutes for new 8-K filings:
1. Queries `https://efts.sec.gov/LATEST/search-index` for today's 8-K filings
2. Checks each `accession_number` against Supabase to skip duplicates
3. Extracts filing text via TinyFish Web Agent API (or direct HTTP fallback)
4. Sends text to Claude Sonnet for classification (Positive / Neutral / Risk)
5. Stores result in Supabase `signals` table
6. Triggers Telegram alert for non-Pending signals

If `ANTHROPIC_API_KEY` is missing or placeholder: stores `signal: "Pending"`, `confidence: 0`, logs a warning. Resumes classification when a real key is set.

---

## Telegram Bot

Bot handle: `@tinyfishafi_bot`

Alert format:
```
🔵 AFI ALERT

[TICKER] — 8-K Filing
Signal: 🟢 Positive / ⚪ Neutral / 🔴 Risk
SUMMARY TEXT

Confidence: XX% | DATE
🔗 View on AFI Dashboard
```

- Controlled by `TELEGRAM_ENABLED=true`
- Skips `signal: "Pending"` alerts
- All calls wrapped in try/except — never crashes the agent

---

## Design System

- **Theme:** Dark mode only (`#050505` background)
- **Accent:** Electric Blue `#0066FF`
- **Signal Colors:** Positive `#00C805` · Neutral `#71717A` · Risk `#FF3333`
- **Border Radius:** 0px (sharp edges everywhere)
- **Fonts:** Inter (UI) + JetBrains Mono (tickers, data, confidence scores)
- **Aesthetic:** Linear / Vercel / Stripe dashboard feel

---

## Supabase Tables

### `signals`
| Column | Type |
|--------|------|
| id | UUID (PK, auto) |
| ticker | TEXT |
| company | TEXT |
| filing_type | TEXT |
| signal | TEXT (Positive/Neutral/Risk/Pending) |
| confidence | INTEGER (0-100) |
| summary | TEXT |
| accession_number | TEXT (unique) |
| filed_at | TIMESTAMPTZ |
| created_at | TIMESTAMPTZ |

### `watchlist`
| Column | Type |
|--------|------|
| id | UUID (PK, auto) |
| user_id | UUID (FK to auth.users) |
| ticker | TEXT |
| created_at | TIMESTAMPTZ |
| | UNIQUE(user_id, ticker) |

---

## Phase Roadmap

| Phase | Status | Key Features |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Dashboard shell, auth, seed signals, watchlist, pricing |
| Phase 2 | ✅ Complete | Supabase migration, live EDGAR feed, AI classification, Telegram bot, realtime dashboard |
| Phase 3 | Planned | REST API, signal feedback loop, market reaction correlation |
| Phase 4 | Planned | White-label API, institutional tier, international filings |

---

## License

Confidential — TinyFish Accelerator submission. © 2026 AFI.