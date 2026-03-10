# AFI - Autonomous Filing Intelligence

AFI is a regulatory intelligence dashboard designed for retail investors and active traders. It monitors SEC EDGAR filings in real time, interprets them utilizing Google's Gemini AI, scores the regulatory signal, and delivers structured intelligence via a real-time dashboard and Telegram alerts before information reaches mainstream news cycles.

---

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Frontend | React 19, React Router v7, Tailwind CSS |
| Backend | FastAPI (Python 3.11) |
| Database | Supabase (PostgreSQL with Realtime Subscriptions) |
| Authentication | Supabase Auth (Email and Password) |
| Artificial Intelligence | Google Gemini (gemini-1.5-flash) |
| Web Agent | TinyFish Web Agent API |
| Alerting System | Telegram Bot API |
| Typography | Inter (UI), JetBrains Mono (Data) |

---

## Project Structure

```text
/
├── backend/
│   ├── server.py            # FastAPI application (auth, signals, watchlist, control)
│   ├── edgar_agent.py       # EDGAR 8-K polling and Gemini AI classification
│   ├── telegram_bot.py      # Telegram alert dispatcher
│   ├── requirements.txt     # Python dependencies
│   └── .env                 # API keys and environment configuration
├── frontend/
│   ├── src/
│   │   ├── App.js                        # Client-side routing
│   │   ├── lib/supabase.js              # Supabase client singleton
│   │   ├── context/AuthContext.jsx       # Authentication state management
│   │   ├── pages/
│   │   │   ├── Landing.jsx               # Marketing entry page
│   │   │   ├── Auth.jsx                  # Authentication forms
│   │   │   ├── Dashboard.jsx             # Real-time alert feed
│   │   │   └── Pricing.jsx               # Subscription tiers
│   │   └── components/
│   │       ├── AlertCard.jsx             # Interactive signal card
│   │       ├── SignalDetailModal.jsx     # Comprehensive signal data overlay
│   │       ├── WatchlistPanel.jsx        # User watchlist management
│   │       └── DashboardSidebar.jsx      # Navigation sidebar
│   ├── tailwind.config.js                # Design system configuration
│   └── .env                              # Frontend environment variables
├── memory/
│   └── PRD.md               # Product Requirements Document
├── CLAUDE.md                # AI agent context and architecture constraints
└── README.md                # System documentation
```

---

## System Architecture

### EDGAR Polling Agent
The autonomous agent (`edgar_agent.py`) executes on a 5-minute interval:
1. Queries the SEC EDGAR EFTS endpoint for new 8-K filings based on the current date.
2. Validates the `accession_number` against the Supabase database to prevent duplicate processing.
3. Extracts the primary document text utilizing the TinyFish Web Agent API (with a direct HTTP fallback mechanism).
4. Submits the extracted text to the Google Gemini API for financial classification (Positive, Neutral, or Risk).
5. Commits the resulting signal to the Supabase `signals` table.
6. Dispatches a formatted Telegram alert for non-pending signals.

Note: If the `GEMINI_API_KEY` is not present, the agent gracefully degrades by storing the filing with a "Pending" status and a confidence score of 0.

### Real-Time Dashboard
The frontend application connects to Supabase utilizing `postgres_changes` subscriptions. When the EDGAR agent commits a new signal to the database, the dashboard immediately reflects the update without requiring a client-side polling interval or page refresh.

---

## API Reference

### Authentication
*   `POST /api/auth/signup`: Create a new user account via Supabase Auth (returns a JWT session).
*   `POST /api/auth/login`: Authenticate an existing user (returns a JWT session).
*   `GET /api/auth/me`: Validate the current user token.

### Signals
*   `GET /api/signals`: Retrieve all processed signals, ordered by filing date descending.
*   `GET /api/signals?tickers=AAPL,NVDA`: Retrieve signals filtered by a comma-separated list of ticker symbols.

### Watchlist (Requires Authentication)
*   `GET /api/watchlist`: Retrieve the authenticated user's active watchlist.
*   `POST /api/watchlist`: Append a ticker to the user's watchlist (Payload: `{ "ticker": "AAPL" }`).
*   `DELETE /api/watchlist/{ticker}`: Remove a ticker from the user's watchlist.

### EDGAR Agent Control
*   `GET /api/edgar/status`: Retrieve the current operational status of the polling agent.
*   `POST /api/edgar/start`: Initialize the 5-minute polling loop.
*   `POST /api/edgar/stop`: Terminate the polling loop.

---

## Database Schema (Supabase)

### Table: signals
*   `id`: UUID (Primary Key, Auto-generated)
*   `ticker`: TEXT (Standardized uppercase)
*   `company`: TEXT (Full registered entity name)
*   `filing_type`: TEXT (E.g., "8-K")
*   `signal`: TEXT (Enum: Positive, Neutral, Risk, Pending)
*   `confidence`: INTEGER (0-100 scale)
*   `summary`: TEXT (Concise classification rationale)
*   `accession_number`: TEXT (Unique SEC document identifier)
*   `filed_at`: TIMESTAMPTZ (Original SEC filing timestamp)
*   `created_at`: TIMESTAMPTZ (Database ingestion timestamp)

### Table: watchlist
*   `id`: UUID (Primary Key, Auto-generated)
*   `user_id`: UUID (Foreign Key referencing auth.users)
*   `ticker`: TEXT (Standardized uppercase)
*   `created_at`: TIMESTAMPTZ
*   Constraint: UNIQUE(user_id, ticker)

---

## Development Environment Setup

### Environment Requirements
Ensure the following variables are configured in `backend/.env`:
*   `SUPABASE_URL`
*   `SUPABASE_ANON_KEY`
*   `SUPABASE_SERVICE_ROLE_KEY`
*   `TINYFISH_API_KEY`
*   `GEMINI_API_KEY`
*   `TELEGRAM_BOT_TOKEN`
*   `TELEGRAM_CHAT_ID`
*   `USE_TINYFISH` (Boolean)
*   `TELEGRAM_ENABLED` (Boolean)

Ensure the following variables are configured in `frontend/.env`:
*   `REACT_APP_SUPABASE_URL`
*   `REACT_APP_SUPABASE_ANON_KEY`
*   `REACT_APP_BACKEND_URL` (E.g., http://localhost:8001)

### Execution Procedures

**Backend Application:**
```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --reload --port 8001
```

**Frontend Application:**
Note: Use `yarn` to prevent dependency resolution conflicts.
```bash
cd frontend
yarn install
yarn start
```

---

## Phase Roadmap

### Phase 1: Foundation (Completed)
*   System architecture and UI design system implementation.
*   Supabase authentication integration.
*   Static seed data generation.
*   Basic watchlist CRUD operations.

### Phase 2: Core Intelligence (Completed)
*   Full migration to Supabase for data persistence and authentication.
*   Integration of the EDGAR polling agent.
*   Implementation of the Gemini AI classification pipeline.
*   Telegram bot integration for external alerting.
*   Real-time dashboard updates via Supabase WebSockets.

### Phase 3: Advanced Capabilities (Pending)
*   Implementation of a REST API gateway for Pro-tier subscribers.
*   User feedback loop mechanism (accuracy voting on AI classifications).
*   Correlation analytics between signals and market reactions.
*   Stripe billing integration.

### Phase 4: Enterprise Expansion (Planned)
*   Support for 10-K, 10-Q, and S-1 filing analysis.
*   White-label API offerings for institutional clients.
*   International regulatory filing support.