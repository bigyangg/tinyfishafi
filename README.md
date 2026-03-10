# AFI - Autonomous Filing Intelligence

AFI is a regulatory intelligence dashboard built for retail investors and active traders. It monitors SEC EDGAR filings autonomously, classifies them with Google Gemini AI, scores each regulatory signal, and delivers structured intelligence through a real-time web dashboard and Telegram alerts.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, React Router v7, Tailwind CSS |
| Backend | FastAPI (Python 3.10+) |
| Database | Supabase (PostgreSQL + Realtime) |
| Authentication | Supabase Auth (Email/Password) |
| AI Classification | Google Gemini 2.5 Flash |
| Web Scraping | TinyFish Web Agent API |
| Alerts | Telegram Bot API |
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
    server.py            # FastAPI app: auth, signals, watchlist, agent control, health, brief
    edgar_agent.py       # EDGAR 8-K polling agent with Gemini AI classification
    telegram_bot.py      # Telegram alert dispatcher
    requirements.txt     # Python dependencies
    .env                 # Backend environment configuration
  frontend/
    src/
      App.js                          # Client-side routing
      lib/supabase.js                # Supabase client singleton
      context/AuthContext.jsx         # Authentication state management
      pages/
        Landing.jsx                   # Marketing landing page
        Auth.jsx                      # Login and signup forms
        Dashboard.jsx                 # Real-time alert feed with live status
        Pricing.jsx                   # Subscription tiers
      components/
        AlertCard.jsx                 # Signal card with confidence bar
        SignalDetailModal.jsx         # Full signal detail overlay
        WatchlistPanel.jsx            # Ticker watchlist management
        DashboardSidebar.jsx          # Navigation with Telegram test
    tailwind.config.js                # Design system configuration
    .env                              # Frontend environment configuration
  memory/
    PRD.md                            # Product Requirements Document
  CLAUDE.md                           # Architecture and constraints reference
  README.md                           # This file
```

---

## System Architecture

### EDGAR Polling Agent

The agent (`edgar_agent.py`) runs autonomously on a 120-second interval:

1. Queries SEC EDGAR EFTS for new 8-K filings filed today
2. Deduplicates against the Supabase `accession_number` field
3. Extracts document text via TinyFish Web Agent (HTTP fallback)
4. Classifies the filing with Gemini 2.5 Flash (Positive, Neutral, or Risk)
5. Stores the signal in Supabase
6. Dispatches a Telegram alert for confirmed classifications

If the Gemini API key is missing or invalid, filings are stored as "Pending" with confidence 0. The agent never crashes on individual filing failures.

### Real-Time Dashboard

The frontend subscribes to Supabase `postgres_changes` on the `signals` table. New signals appear instantly via WebSocket without page refresh. A 60-second polling fallback ensures data consistency.

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

### Watchlist (Authenticated)
- `GET /api/watchlist` - User's watchlist
- `POST /api/watchlist` - Add ticker (`{"ticker": "AAPL"}`)
- `DELETE /api/watchlist/{ticker}` - Remove ticker

### Intelligence
- `GET /api/brief` - AI-generated 3-sentence market brief from latest signals

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

### watchlist

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to auth.users |
| ticker | TEXT | Stock symbol (uppercase) |
| created_at | TIMESTAMPTZ | Timestamp |

Constraint: UNIQUE(user_id, ticker). Maximum 10 tickers per user.

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

### Phase 3: Advanced Capabilities (Planned)
- REST API gateway for Pro-tier subscribers
- User feedback loop on AI accuracy
- Signal-to-price correlation analytics
- Stripe billing integration

### Phase 4: Enterprise (Planned)
- 10-K, 10-Q, S-1 filing support
- White-label API for institutional clients
- International regulatory filing support