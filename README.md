# AFI - Market Event Intelligence

AFI is a real-time market event intelligence platform for active traders and finance researchers. It monitors SEC EDGAR filings continuously, detects new 8-K events within 2 minutes of publication, classifies market impact, enriches with price and sentiment data, and delivers structured signals through a live dashboard and Telegram alerts.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, React Router v7 |
| Backend | FastAPI (Python 3.10+) |
| Database | Supabase (PostgreSQL + Realtime) |
| Authentication | Supabase Auth (Email/Password) |
| AI Classification | Google Gemini 2.5 Flash |
| Web Scraping | TinyFish Web Agent API |
| Alerts | Telegram Bot API, Browser Push Notifications |
| Email | Resend (optional, for daily digests) |
| Fonts | Inter (UI), JetBrains Mono (Data) |

---

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- npm
- A Supabase project with `signals` and `watchlist` tables
- A Google Gemini API key
- A Telegram bot token and chat ID (optional)

### 1. Clone the Repository

```bash
git clone https://github.com/bigyangg/tinyfishafi.git
cd tinyfishafi
```

### 2. Configure Backend Environment

Create `backend/.env` with the following variables:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
TINYFISH_API_KEY=your-tinyfish-key
GEMINI_API_KEY=your-gemini-api-key
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_CHAT_ID=your-telegram-chat-id
USE_TINYFISH=true
TELEGRAM_ENABLED=true
CORS_ORIGINS=*
RESEND_API_KEY=your-resend-key          # Optional: for daily email digests
DIGEST_EMAIL=you@example.com            # Optional: digest recipient
FRONTEND_URL=http://localhost:3000      # Optional: used in digest email links
```

### 3. Configure Frontend Environment

Create `frontend/.env` with the following variables:

```env
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
REACT_APP_BACKEND_URL=http://localhost:8001
```

### 4. Install and Start the Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --reload --port 8001
```

On startup, the server will:
- Clean any residual seed data from the database
- Auto-start the EDGAR polling agent (120-second interval)
- Begin classifying filings with Gemini AI immediately

### 5. Install and Start the Frontend

```bash
cd frontend
npm install --legacy-peer-deps
npm start
```

The dashboard will be available at `http://localhost:3000`.

### 6. Verify the System

- Open `http://localhost:3000` and log in
- The **Agent Status Bar** at the top should show **UP** with a pulsing green dot
- The **ONLINE** badge in the top-right confirms backend connectivity
- Real 8-K filings should appear within the first poll cycle (120 seconds)
- Click **Test Telegram** in the sidebar to verify Telegram alerts

---

## Project Structure

```
tinyfishafi/
  backend/
    server.py              # FastAPI app: auth, signals, watchlist, agent control, config, health
    edgar_agent.py         # EDGAR 8-K polling agent — delegates to signal pipeline
    signal_pipeline.py     # Core orchestrator: classify -> enrich -> score -> store
    event_classifier.py    # Deterministic taxonomy mapper (8-K item extraction)
    market_data.py         # Yahoo Finance wrapper with 5-min TTL cache
    sentiment_analyzer.py  # Filing vs news tone comparison
    impact_engine.py       # Rule-based composite scoring (0-100)
    price_tracker.py       # Scheduled T+1h/24h/3d price correlation checks
    telegram_bot.py        # Smart Telegram alerts (watchlist-aware, multi-threshold)
    schema_migration.sql   # Phase 3 database migration script
    requirements.txt       # Python dependencies (includes yfinance)
    .env                   # Backend environment configuration
    tests/                 # Unit tests for all pipeline modules
  frontend/
    public/
      sw.js                           # Service worker for browser push notifications
    src/
      App.js                          # Client-side routing
      lib/supabase.js                # Supabase client singleton
      context/AuthContext.jsx         # Authentication state management
      hooks/
        usePushNotifications.js       # Browser notification hook
      pages/
        Landing.jsx                   # Marketing landing page
        Auth.jsx                      # Login and signup forms
        Dashboard.jsx                 # Real-time alert feed with caching + skeletons
      components/
        AlertCard.jsx                 # Dense 4-column signal card
        SignalSkeleton.jsx            # Shimmer loading placeholders
        SignalDetailModal.jsx         # Full signal detail with event type + impact score
        WatchlistPanel.jsx            # Ticker search via backend proxy
        DashboardSidebar.jsx          # Navigation with sign out + Telegram test
    .env                              # Frontend environment configuration
  CLAUDE.md                           # Architecture and constraints reference
  README.md                           # This file
```

---

## System Architecture

### Signal Pipeline

The pipeline (`signal_pipeline.py`) processes filings through a chain of enrichment steps:

1. **Classify** — Gemini 2.5 Flash analyzes filing text (Positive / Neutral / Risk)
2. **Taxonomy** — Deterministic event mapping (EARNINGS_BEAT, EXEC_DEPARTURE, etc.)
3. **Enrich** — Yahoo Finance fetches current price and news (cached 5 min)
4. **Sentiment** — Compares filing signal against news headlines
5. **Score** — Composite impact score (0-100): confidence + event weight + sentiment + watchlist
6. **Store** — Enriched signal saved to Supabase
7. **Track** — Price checks scheduled at T+1h, T+24h, T+3d
8. **Alert** — Telegram notification if impact threshold met

New filing types plug in via registry: `pipeline.register_processor("4", Form4Processor())`

### EDGAR Polling Agent

The agent (`edgar_agent.py`) runs autonomously on a 120-second interval:

1. Loads config and processes promotion queue at cycle start
2. Queries SEC EDGAR EFTS for new 8-K filings filed today
3. **Resolves tickers from CIK** via `data.sec.gov/submissions/CIK{padded}.json`
4. Deduplicates against the Supabase `accession_number` field
5. Extracts document text via **3-step fallback chain**: TinyFish -> SEC EFTS full-text -> HTTP scrape (with `follow_redirects`)
6. Delegates to `SignalPipeline.process()` for full classification + enrichment
7. Dispatches a Telegram alert using smart thresholds (watchlist tickers always, confidence >= 60 for Positive/Risk, impact >= 55)

If the Gemini API key is missing or invalid, filings are stored as "Pending" with confidence 0. The agent never crashes on individual filing failures.

### Notification Architecture

AFI has three independent, optional notification channels:

```
New signal stored in Supabase
        |
  +-----+------+------+
  |     |      |      |
  v     v      v      v
Email  Telegram  Browser  Dashboard
(Resend) (Bot)  (Push)   (Realtime WS)
```

Each channel works independently — disabling one does not affect the others:

- **Dashboard:** Receives signals via Supabase Realtime WebSocket. Shows skeleton UI while loading, then instant cache hits on revisit.
- **Telegram:** Smart multi-threshold alerting. Always alerts for watchlist tickers. Rich HTML format with company info, event labels, and SEC EDGAR links.
- **Browser Push:** Native OS notifications when tab is closed. Permission prompt shown on first visit. Service worker handles background events.
- **Email Digest:** Daily summary of top 5 signals via Resend. Triggered via `POST /api/digest/send` (schedule with cron). Returns HTML preview if Resend is not configured.

### Real-Time Dashboard

The frontend subscribes to Supabase `postgres_changes` on the `signals` table. New signals slide in from the top with a 200ms animation. Features include:

- Pulsing green dot when agent is UP, red status bar when DOWN
- Live countdown to next poll (ticks every second)
- Filings processed counter (updates via realtime)
- ALL/WATCHLIST feed tabs with WATCHED badge on matching cards
- **★ Quick-add button** on each card to add ticker to watchlist
- **Impact bar** (orange/amber/gray) and **event type badge** on each card
- Yahoo Finance autocomplete for watchlist via backend proxy
- 30-second relative timestamp auto-updates
- **Market Brief age counter** ("42s ago" / "3m ago")

### AI Market Brief

The `/api/brief` endpoint sends the last 10 signals to Gemini and returns a 3-sentence market intelligence summary. The brief panel refreshes automatically when new signals arrive.

---

## API Reference

### Health and Status
- `GET /api/health` - System health check (status, timestamp, agent state)
- `GET /api/edgar/status` - Agent status (running/stopped, last poll, countdown, filings today)
- `POST /api/edgar/start` - Start the polling agent manually
- `POST /api/edgar/stop` - Stop the polling agent

### Authentication
- `POST /api/auth/signup` - Create account (returns JWT session)
- `POST /api/auth/login` - Authenticate (returns JWT session)
- `GET /api/auth/me` - Validate current token

### Signals
- `GET /api/signals` - All signals, ordered by filing date descending
- `GET /api/signals?tickers=AAPL,NVDA` - Filter by ticker symbols
- `POST /api/signals/{id}/correct` - Submit user correction (`{"correction": "Risk"}`)
- `GET /api/signals/{id}/correlation` - Price correlation data (T+1h, T+24h, T+3d)

### Watchlist (Authenticated)
- `GET /api/watchlist` - User's watchlist
- `POST /api/watchlist` - Add ticker (`{"ticker": "AAPL"}`)
- `DELETE /api/watchlist/{ticker}` - Remove ticker

### Configuration
- `GET /api/config` - Agent configuration (tier1 tickers, settings, version)
- `POST /api/config` - Update config (auto-increments version)

### Intelligence
- `GET /api/brief` - AI-generated 3-sentence market brief (cached 5 min server-side)
- `POST /api/digest/send` - Send daily email digest of top signals (via Resend)

### Telegram
- `POST /api/telegram/test` - Send a test message to the configured Telegram chat

---

## Database Schema

### signals

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| ticker | TEXT | Stock symbol (uppercase) |
| company | TEXT | Company name |
| filing_type | TEXT | Filing type (8-K) |
| signal | TEXT | Positive, Neutral, Risk, or Pending |
| confidence | INTEGER | 0-100 scale |
| summary | TEXT | AI-generated classification summary |
| accession_number | TEXT | Unique SEC identifier |
| filed_at | TIMESTAMPTZ | SEC filing timestamp |
| created_at | TIMESTAMPTZ | Database ingestion timestamp |
| event_type | TEXT | Taxonomy event (EARNINGS_BEAT, EXEC_DEPARTURE, etc.) |
| filing_subtype | TEXT | 8-K item number (e.g. "8-K Item 5.02") |
| impact_score | INTEGER | Composite importance score (0-100) |
| sentiment_delta | REAL | Filing vs news alignment (-1.0 to 1.0) |
| sentiment_match | BOOLEAN | Whether filing and news sentiment agree |
| user_correction | TEXT | User-submitted signal override |
| correction_count | INTEGER | Number of corrections received |
| config_version_at_classification | INTEGER | Agent config version when classified |

### watchlist

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to auth.users |
| ticker | TEXT | Stock symbol (uppercase) |
| created_at | TIMESTAMPTZ | Timestamp |

Constraint: UNIQUE(user_id, ticker). Maximum 10 tickers per user.

### price_correlations

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| signal_id | UUID | Foreign key to signals |
| ticker | TEXT | Stock symbol |
| price_at_filing | REAL | Price when filing was processed |
| check_1h_at / check_24h_at / check_3d_at | TIMESTAMPTZ | Scheduled check times |
| price_1h / price_24h / price_3d | REAL | Prices at each checkpoint |
| pct_change_1h / pct_change_24h / pct_change_3d | REAL | Percentage changes |

### agent_config

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| config_version | INTEGER | Auto-incrementing version number |
| tier1_tickers | JSONB | Priority ticker list |
| pending_promotions | JSONB | Tickers awaiting promotion |
| settings | JSONB | Configurable pipeline settings |

---

## Design System

- Background: `#050505` (dark mode only)
- Surface: `#0A0A0A`
- Accent: `#0066FF`
- Signal colors: Positive `#00C805`, Risk `#FF3333`, Neutral `#71717A`
- Border radius: 0px globally
- Fonts: Inter (UI), JetBrains Mono (tickers, data, timestamps)
- Animations: Subtle only (75ms transitions, pulse for live indicators)

---

## Roadmap

### Phase 1: Foundation (Complete)
- UI design system and component architecture
- Supabase authentication
- Static seed data and watchlist CRUD

### Phase 2: Core Intelligence (Complete)
- Supabase migration (replaced MongoDB)
- EDGAR polling agent with auto-start
- Gemini 2.5 Flash AI classification
- Telegram alerting
- Real-time dashboard with WebSocket subscriptions
- Health monitoring and AI market brief

### Phase 3: Signal Pipeline (In Progress)
- Extensible signal pipeline with registry pattern
- Event taxonomy mapping (deterministic classification)
- Yahoo Finance market data enrichment with TTL cache
- Sentiment analysis (filing vs news tone comparison)
- Composite impact scoring (0-100)
- Price correlation tracking (T+1h, T+24h, T+3d)
- Agent config versioning and promotion queue
- Signal correction feedback loop
- Yahoo Finance autocomplete for watchlist
- Live dashboard polish (countdown, animations, WATCHED badges)
- Telegram HTML formatting fix

### Phase 4: Proactive Alerting (Complete)
- Smart Telegram thresholds (watchlist-aware, multi-factor)
- Rich HTML Telegram alerts (company info, event labels, EDGAR links)
- Browser push notifications (service worker + permission prompt)
- Daily email digest endpoint (Resend integration)
- Dashboard performance: parallel fetching, sessionStorage caching, skeleton UI

### Phase 5: Enterprise (Planned)
- Form 4, 10-K, 10-Q, S-1 filing support via plugin processors
- REST API gateway for Pro-tier subscribers
- Per-user Telegram alerts (personal chat IDs)
- Stripe billing integration
- White-label API for institutional clients