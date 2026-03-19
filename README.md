# AFI — Market Event Intelligence

AFI is a real-time market event intelligence platform for active traders and finance researchers. It monitors SEC EDGAR continuously via the EDGAR Atom feed, detects new multi-form filings (8-K, 10-K, 10-Q, S-1, Form 4, SC 13D, DEF 14A, NT 10-K, NT 10-Q, 8-K/A, CORRESP) using dynamic poll intervals (45–300s by market hour), and extracts filing content using a **form-specific strategy**: direct HTTP for short forms (~1-2s), SEC XBRL structured APIs for annual/quarterly reports (~3s), and TinyFish for JS-rendered enrichment on Yahoo Finance. It applies 5-stage governance validation, classifies market impact with Gemini 2.5 Flash structured JSON schema, orchestrates **9 concurrent enrichment agents** (including TinyFish market context), scores divergence between filings and public sentiment, and delivers signals through a live Bloomberg-style dashboard with full dark/light theme support, per-user Telegram alerts, browser push notifications, and email digests. Failed filings are queued to a dead-letter table for automatic retry with exponential backoff.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, React Router v7, CRACO |
| Backend | FastAPI (Python 3.10+) |
| Database | Supabase (PostgreSQL + Realtime) |
| Authentication | Supabase Auth (Email/Password, JWT) |
| AI Classification | Google Gemini 2.5 Flash (via `google-genai` SDK v1.65+, model chain fallback, 503 retry) |
| Web Scraping | TinyFish Web Agent API (SSE streaming, Yahoo Finance enrichment) |
| Filing Extraction | Form-specific strategy: HTTP direct / SEC XBRL API / TinyFish |
| Enrichment | 9 concurrent agents (`asyncio.gather`) including TinyFish market context |
| Live Data Streaming | Server-Sent Events (SSE) |
| Alerts | Telegram Bot API (global + per-user), Browser Push Notifications |
| Email | Resend (optional, for daily digests) |
| Market Data | Yahoo Finance (`yfinance`) with 5-min TTL cache |
| Fonts | Inter (UI), JetBrains Mono (Data) |

---

## Developing with Claude Code

AFI includes a tailored suite of **Claude Code Agents** (`.claude/agents/`) to help manage, debug, and upgrade the system safely. Instead of using a single generic assistant, we use a **Multi-Agent Orchestration Protocol**.

To use the agents, make sure you have the Claude Code CLI installed and authenticated:
```bash
npm install -g @anthropic-ai/claude-code
```

Start the CLI from the project root:
```bash
claude
```

**Available Agents:**
- **/agent afi-principal-architect** — Start here. Use this agent to coordinate system-wide upgrades, diagnose cross-layer issues, or orchestrate work across the sub-agents.
- **/agent afi-backend-engineer** — For async Python, FastAPI, and EDGAR agent pipeline work.
- **/agent afi-frontend-engineer** — For React rendering performance, UI design rules, and Supabase real-time updates.
- **/agent afi-ai-systems-engineer** — For Gemini entity extraction, prompts, governance, and deterministic JSON.
- **/agent afi-qa-reliability** — For testing, failure injection, and validating endpoints.

You can switch personas at any point using the `/agent` command. The Principal Architect will direct you on when to switch to specialized sub-agents.

---

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- npm or yarn
- A Supabase project with required tables (auto-migrated on startup)
- A Google Gemini API key
- A TinyFish API key (optional, enrichment agents degrade gracefully without it)
- A Telegram bot token and chat ID (optional)

### 1. Clone the Repository

```bash
git clone https://github.com/bigyangg/tinyfishafi.git
cd tinyfishafi
```

### 2. Configure Backend Environment

Create `backend/.env` with the following variables:

```env
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-api-key

# Agents (optional — set USE_TINYFISH=false to skip all agent calls)
TINYFISH_API_KEY=your-tinyfish-key
USE_TINYFISH=true

# Telegram (optional)
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_CHAT_ID=your-telegram-chat-id
TELEGRAM_ENABLED=true

# General
CORS_ORIGINS=*

# Email Digests (optional)
RESEND_API_KEY=your-resend-key
DIGEST_EMAIL=you@example.com
FRONTEND_URL=http://localhost:3000
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
1. Run Supabase schema migration for enrichment and Phase 10 columns
2. Clean any residual seed data from the database
3. Perform EDGAR connectivity check (logs warning if unreachable)
4. Auto-start the EDGAR polling agent (dynamic 45–300s interval by market hour)
5. Start the failed-filings retry background task (checks every 10 minutes)
6. Start genome backfill for Tier 1 companies (non-blocking)
7. Start Telegram command polling for `/start` and `/verify` commands (non-blocking)
8. Log `=== AFI SERVER READY — all systems initialized ===`

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
- Real filings (8-K, 10-K, 10-Q, S-1, Form 4, SC 13D, DEF 14A, NT 10-K, NT 10-Q, 8-K/A) should appear within the first poll cycle (45s during market hours, up to 300s off-hours)
- Use the **Smart Trigger** in the sidebar to test a full sweep for any ticker
- Click **Test Telegram** in the sidebar to verify Telegram alerts
- Visit `/leaderboard` to see the Divergence Leaderboard

---

## Project Structure

```
tinyfishafi/
  backend/
    server.py                # FastAPI app: auth, signals, watchlist, agent control, leaderboard, telegram, health
    edgar_agent.py           # EDGAR multi-form polling agent (11 form types); dynamic poll intervals; content hash dedup; 3-step CIK→ticker fallback
    signal_pipeline.py       # Core orchestrator: classify -> govern -> enrich -> score -> store; dead-letter queue on failure
    intelligence/            # Enrichment pipeline module
      enrichment_pipeline.py # Orchestration: 9 agents (8 domain + TinyFish market context) via asyncio.gather + divergence analysis + column mapping
      genome_engine.py       # Genome backfill logic for Tier 1 companies
    agents/                  # Agent Infrastructure
      base_agent.py          # Base class: timeout, retry, graceful failure, USE_TINYFISH guard
      edgar_filing_agent.py  # EDGAR filing text extraction
      news_agent.py          # Yahoo Finance news scraping
      social_agent.py        # Reddit + StockTwits sentiment analysis
      insider_agent.py       # SEC Form 4 insider transactions
      congress_agent.py      # Congressional trading data
      divergence_agent.py    # Press release extraction for divergence analysis
      genome_agent.py        # Filing history pattern analysis
      options_agent.py       # 8th agent: unusual options volume detection (put/call ratio, 3× OI threshold)
    processors/              # Form-specific AI classifiers (all use structured Gemini JSON schema)
      form_8k.py             # 8-K material event processor (earnings quantification: EPS, revenue, guidance)
      form_10k.py            # 10-K annual report processor
      form_10q.py            # 10-Q quarterly earnings processor (EPS/revenue beat/miss quantification)
      form_4.py              # Form 4 insider transaction processor
      form_sc13d.py          # SC 13D activist filing processor
      form_s1.py             # S-1 IPO registration processor
      form_nt.py             # NT 10-K / NT 10-Q late-filing processor (always Risk; severity flags)
      gemini_helper.py       # classify_sync() / call_gemini() / call_gemini_async() — google-genai SDK, thread-safe singleton, 503 retry, 2048 token limit
    governance.py            # 5-check validation layer (confidence, news, facts, consistency, junk)
    event_classifier.py      # Deterministic taxonomy mapper (8-K item extraction)
    market_data.py           # Yahoo Finance wrapper with 5-min TTL cache
    sentiment_analyzer.py    # Filing vs news tone comparison
    impact_engine.py         # Rule-based composite scoring (0-100)
    price_tracker.py         # Scheduled T+1h/24h/3d price correlation checks
    telegram_bot.py          # Telegram alerts: global + per-user, command polling, double-send prevention
    email_service.py         # Resend email digest service
    schema_migration.sql     # Database migration script for enrichment columns
    requirements.txt         # Python dependencies
    .env                     # Backend environment configuration
    tests/
      test_signal_pipeline.py  # Pipeline unit tests
      test_form_s1.py          # S-1 processor tests
      test_leaderboard.py      # Enrichment column mapping tests
  frontend/
    public/
      sw.js                            # Service worker for browser push notifications
    src/
      App.js                           # Client-side routing with AppLayout/Outlet pattern (single AppShell mount); AppDataProvider at root
      lib/supabase.js                  # Supabase client singleton
      context/
        AuthContext.jsx                # Authentication state management
        AppDataContext.jsx             # Persistent global state: single Supabase channel, health check (2-strike), agentStatus cache
      hooks/
        usePushNotifications.js        # Browser notification hook
      pages/
        Graph.jsx                      # "God's View" Force-graph visualization of sector relationships
        Landing.jsx                    # Premium landing page (dot-grid, glassmorphism, animated feature cards)
        Auth.jsx                       # Login and signup forms
        Dashboard.jsx                  # Categorized feed + right panel (demo trigger, stats, watchlist)
        Leaderboard.jsx                # Divergence Leaderboard (ranked by SAID vs FILED contradictions)
        Logs.jsx                       # Live SSE pipeline log viewer for debugging
        Runs.jsx                       # Executive dashboard for historical pipeline sweeps
        Watchlist.jsx                  # Watchlist management with inline filing expand
        Signal.jsx                     # Individual signal detail page
        Settings.jsx                   # User settings page
      components/
        AppShell.jsx                   # Shared layout shell (sidebar + status bar); reads from AppDataContext; dark/light toggle synced to body.theme-light + localStorage
        MarketPulse.jsx                # Top status bar indicator with pulsing 0-100 market stress score
        AlertCard.jsx                  # Filing card: WHY line, divergence badge, genome alert, insider amounts; React.memo with custom comparator
        SignalDetailModal.jsx          # Full enrichment modal: divergence, genome, social, insider, congress, news
        TinyFishContext.jsx            # Deep Context enrichment panel (8s live enrichment illusion)
        RippleDrawer.jsx               # Sector Ripple drawer showing supply chain / peer impact
        SignalSkeleton.jsx             # Shimmer loading placeholders
        WatchlistPanel.jsx             # Ticker search via backend proxy
        DashboardSidebar.jsx           # Navigation with sign out + Telegram test
    .env                               # Frontend environment configuration
  CLAUDE.md                            # Architecture and constraints reference
  README.md                            # This file
```

---

## System Architecture

### Signal Pipeline

The pipeline (`signal_pipeline.py`) processes filings through a chain of enrichment steps:

0. **Dedup** — SHA-256 content hash of first 5,000 chars checked against `signals.content_hash` before processing
1. **Classify** — Structured Gemini JSON schema (`response_mime_type="application/json"`, `max_output_tokens=2048`). Model chain: `gemini-2.5-flash` → `gemini-2.5-flash-lite` → `gemini-2.0-flash`. 503/overload retry with 3s/6s/9s wait. conf:0 results dropped (not stored).
2. **Taxonomy** — Deterministic event mapping (EARNINGS_BEAT, EXEC_DEPARTURE, INSIDER_BUY, IPO_REGISTRATION, etc.)
3. **Govern** — 5-check validation: confidence floor, news divergence, key facts, event consistency, junk filter
4. **Diverge** — Computes divergence score (0-100) comparing filing signal vs news/social sentiment. Positive filing + negative news = `POSITIVE_FILING_NEGATIVE_NEWS`. Stores score, type, and contradiction summary.
5. **Enrich** — 9 Agents (edgar, news, social, insider, congress, divergence, genome, options, tinyfish_market) fire simultaneously via `asyncio.gather`
6. **Score** — Composite impact score (0-100): confidence + event weight + sentiment + watchlist + governance penalty; short interest and options sentiment factored in
7. **Store** — Enriched signal saved to Supabase with 34+ columns and full audit trail
8. **Track** — Price checks scheduled at T+1h, T+24h, T+3d
9. **Alert** — Telegram notification (global + per-user) if impact threshold met

On any pipeline failure, the filing is written to `failed_filings` with `error_stage` and retried after `2^retry_count` minutes (max 3 attempts).

New filing types plug in via registry: `pipeline.register_processor("S-1", FormS1Processor())`

### EDGAR Polling Agent

The agent (`edgar_agent.py`) runs autonomously with **dynamic poll intervals** — 45s during market open, 90s pre/post-market, 60s at open/close transitions, 300s off-hours — based on US Eastern Time:

1. Loads config and processes promotion queue at cycle start
2. Queries SEC EDGAR EFTS for new filings (8-K, 10-K, 10-Q, S-1, Form 4, SC 13D, DEF 14A, NT 10-K, NT 10-Q, 8-K/A, CORRESP) filed today
3. **Resolves tickers from CIK** via 3-step fallback: SEC JSON → yfinance Search → `UNKNOWN__<CIK>`
4. Deduplicates against `accession_number` and `content_hash` (SHA-256 of first 5,000 chars)
5. Extracts document text via **form-specific strategy** (`EXTRACTION_STRATEGY` dict):
   - **Short forms** (8-K, 4, SC 13D, S-1, DEF 14A, NT): direct HTTP scrape (~1-2s)
   - **10-K / 10-K/A**: SEC XBRL Company Facts API + Submissions API (~3s, returns structured `$39.3B Revenue`, `$3.23 EPS` data)
   - **10-Q / 10-Q/A**: SEC XBRL API then HTTP fallback
6. Routes to the correct form-specific processor via registry pattern
7. Delegates to `SignalPipeline.process()` for full classification + enrichment
8. Dispatches Telegram alerts via `dispatch_signal_alert()` using smart thresholds (watchlist tickers always, confidence ≥ 60 for Positive/Risk, impact ≥ 55)

The `_poll_loop` has a top-level try/except with 30s backoff on crash; `get_status()` uses `thread.is_alive()` for accurate health reporting.

Each filing type has a dedicated processor with structured Gemini JSON schema:
- **Form8KProcessor** — Material events, earnings (EPS/revenue/guidance quantification), leadership changes, debt financing
- **Form10KProcessor** — Annual reports, revenue trends, audit opinions
- **Form10QProcessor** — Quarterly earnings, beat/miss, EPS/revenue quantification, guidance direction/magnitude
- **Form4Processor** — Insider buys/sells, option exercises, transaction significance
- **FormSC13DProcessor** — Activist entries, stake sizes, investor intent
- **FormS1Processor** — IPO registration, S-1 financials, underwriter analysis, lock-up periods, risk assessment
- **FormNTProcessor** — NT 10-K / NT 10-Q late-filing notifications; always Risk; extracts severity flags (restatement, going concern, SEC investigation, material weakness)

If Gemini fails completely (conf:0), the filing is dropped from the signal feed and written to `failed_filings` for automatic retry. The agent never crashes on individual filing failures.

### Intelligence Agents

AFI deploys **9 specialized enrichment agents** that run concurrently via `asyncio.gather`:

| Agent | Source | Output |
|-------|--------|--------|
| **EdgarFilingAgent** | SEC EDGAR | Filing text extraction |
| **NewsAgent** | Yahoo Finance | News headlines, sentiment score, dominant theme |
| **SocialSentimentAgent** | Reddit, StockTwits | Social sentiment, volume spikes, social vs filing delta |
| **InsiderTransactionAgent** | SEC (Form 4) | Net 30d/90d insider value, CEO activity, unusual delays |
| **CongressTradingAgent** | House/Senate | Congressional trades, net sentiment, suspicious timing |
| **DivergenceDetectionAgent** | Press releases | Key claims for SAID vs FILED analysis |
| **GenomeAgent** | EDGAR filing history | Filing patterns, amendment ratios, genome score/trend/alert |
| **OptionsActivityAgent** | Yahoo Finance options chain | Put/call ratio, unusual volume (>3× open interest), options sentiment |
| **TinyFish Market Context** | Yahoo Finance (JS-rendered) | Live price, change%, volume, market cap, analyst rating |

The TinyFish Market Context agent (`_tinyfish_enrich_market_context`) is a dedicated showcase of TinyFish's ability to extract data from JavaScript-rendered pages. Yahoo Finance requires a real browser agent — unlike static SEC filings — making it the ideal TinyFish use case. Results stored as `tf_price`, `tf_change_pct`, `tf_volume`, `tf_market_cap`, `tf_analyst_rating`.

All agents:
- Respect the `USE_TINYFISH` environment variable — skip cleanly when disabled
- Have a 12-second timeout with graceful failure (return `{}` on error)
- Never crash the pipeline — individual agent failures are logged and skipped

### Notification Architecture

AFI has four independent, optional notification channels:

```
New signal stored in Supabase
        │
  ┌─────┼───────┬────────┐
  │     │       │        │
  ▼     ▼       ▼        ▼
Email  Telegram  Browser  Dashboard
(Resend) (Bot)  (Push)   (Realtime WS)
         │
    ┌────┴────┐
    │         │
  Global   Per-User
  (CHAT_ID) (user_telegram)
```

Each channel works independently — disabling one does not affect the others:

- **Dashboard:** Receives signals via Supabase Realtime WebSocket. Shows skeleton UI while loading, then instant cache hits on revisit.
- **Telegram (Global):** Smart multi-threshold alerting. Always alerts for watchlist tickers. Rich HTML format explicitly lists extracted intelligence events (🟢 EARNINGS BEAT, 🔴 INSIDER SELL) directly in chat with deep links to the dashboard.
- **Telegram (Per-User):** Users connect via `/api/telegram/connect` → get verification code → send `/verify CODE` to bot. `dispatch_signal_alert()` sends to all verified chat IDs with double-send prevention.
- **Browser Push:** Native OS notifications when tab is closed. Permission prompt shown on first visit. Service worker handles background events.
- **Email Digest:** Daily summary of top 5 signals via Resend. Triggered via `POST /api/digest/send` (schedule with cron). Returns HTML preview if Resend is not configured.

### Divergence Leaderboard

The `/api/leaderboard/divergence` endpoint returns companies ranked by their divergence score — a measure of the gap between what the CEO says publicly and what the SEC filing reveals. The leaderboard:
- Queries all signals with `divergence_score > 0`, deduplicates by ticker keeping highest score
- Returns sorted results with severity levels (LOW, MEDIUM, HIGH, CRITICAL)
- Falls back to top signals ordered by `impact_score DESC` when no divergence data exists yet

### Real-Time Dashboard

The frontend subscribes to Supabase `postgres_changes` on the `signals` table. New signals slide in from the top with a 200ms animation. Features include:

- Pulsing green dot when agent is UP, red status bar when DOWN
- Live countdown to next poll (ticks every second)
- Filings processed counter (updates via realtime)
- **Categorized feed:** signals grouped by event type across 7 categories:
  - EARNINGS & FINANCIAL (green) — earnings beats/misses, quarterly reports
  - INSIDER ACTIVITY (purple) — insider buys/sells from Form 4
  - ACTIVIST & CORPORATE (blue) — activist entries from SC 13D
  - LEADERSHIP & CORP EVENTS (orange) — executive changes, M&A
  - ANNUAL REPORTS (amber) — 10-K annual filings
  - REGULATORY & LEGAL (red) — compliance, litigation
  - ROUTINE FILINGS (gray) — administrative filings
- **Accordion sections:** each category is a collapsible card with SHOW/HIDE button, ticker previews when collapsed, and count badges
- **FeedSummaryBar:** quick-glance category pill counts (all 7 categories)
- ALL/WATCHLIST/RISK/OPPORTUNITY filter tabs with count badges
- **★ Quick-add button** on each card to add ticker to watchlist
- **Filing type badges** (color-coded: 8-K blue, 10-K amber, 10-Q green, Form 4 purple, SC 13D orange, S-1 teal)
- **Confidence scores** (color-coded by signal classification) and **event type labels** on each card
- **WHY line** — first key fact extracted from filing shown on each card
- **NEWS DIVERGENCE badge** — shown when filing signal conflicts with news sentiment
- **GENOME ALERT badge** — shown when abnormal filing patterns detected
- **Insider transaction details** — TYPE/VALUE/ROLE row for Form 4 cards
- **Impact bar** on each compact 3-column card
- Yahoo Finance autocomplete for watchlist via backend proxy
- **Signal Detail Modal** — full enrichment overlay with: divergence detection, genome alerts, social sentiment, insider activity, congress trades, news headlines, price impact (1H/24H/3D)
- **Right panel:** TODAY stats, TOP SIGNALS, MARKET BRIEF, WATCHLIST zone, **Smart Demo Trigger** (with ticker autocomplete)
- **Deep Context Panel (`TinyFishContext.jsx`)** — Provides a sleek 8-second "live enrichment" illusion while asynchronously extracting entities, financial figures, and risk language.
- **Sector Ripple Drawer (`RippleDrawer.jsx`)** — Expands to show affected supply chain peers with custom directional arrows and reasoning.
- **Market Pulse (`MarketPulse.jsx`)** — 0-100 real-time market stress indicator in the top nav, complete with color-coded pulsing aura.
- **"God's View" Correlation Graph (`/graph`)** — Live `react-force-graph-2d` network mapping supply chain and peer dependencies, complete with pulsing red/green nodes for active signals.
- **Dedicated Sweeps Dashboard (`/runs`)**: Rich history tracking of full pipeline runs with extracted signals
- **Live Execution Monitor (`/logs`)**: Backend terminal stdout streamed over SSE for debugging
- **Divergence Leaderboard (`/leaderboard`)**: Company rankings by SAID vs FILED contradiction score
- **Instant rendering** via localStorage cache — no loading spinners on revisit
- 30-second relative timestamp auto-updates
- **Market Brief age counter** ("42s ago" / "3m ago")

### Concurrency & Threading

The backend relies on `asyncio` for the main FastAPI event loop, but delegates heavy synchronous AI tasks (Gemini classification, Yahoo Finance lookup) into separate threads via `asyncio.to_thread`. This guarantees that the live SSE `/logs/stream` endpoint and other REST endpoints never hang or freeze while the `trigger-all` sweep is computing.

### AI Market Brief

The `/api/brief` endpoint sends the last 10 signals to Gemini and returns a 3-sentence market intelligence summary. The brief panel refreshes automatically when new signals arrive.

---

## API Reference

### Health and Status
- `GET /api/health` — System health check (status, timestamp, agent state)
- `GET /api/edgar/status` — Agent status (running/stopped, last poll, countdown, filings today)
- `POST /api/edgar/start` — Start the polling agent manually
- `POST /api/edgar/stop` — Stop the polling agent

### Authentication
- `POST /api/auth/signup` — Create account (returns JWT session)
- `POST /api/auth/login` — Authenticate (returns JWT session)
- `GET /api/auth/me` — Validate current token

### Signals
- `GET /api/signals` — All signals, ordered by filing date descending
- `GET /api/signals?tickers=AAPL,NVDA` — Filter by ticker symbols
- `GET /api/signals/{id}` — Full signal with audit trail (chain of thought, governance, impact breakdown)
- `POST /api/signals/{id}/correct` — Submit user correction (`{"correction": "Risk"}`)
- `GET /api/signals/{id}/correlation` — Price correlation data (T+1h, T+24h, T+3d)

### Watchlist (Authenticated)
- `GET /api/watchlist` — User's watchlist
- `POST /api/watchlist` — Add ticker (`{"ticker": "AAPL"}`)
- `DELETE /api/watchlist/{ticker}` — Remove ticker

### Configuration
- `GET /api/config` — Agent configuration (tier1 tickers, settings, version)
- `POST /api/config` — Update config (auto-increments version)

### Intelligence
- `GET /api/brief` — AI-generated 3-sentence market brief (cached 5 min server-side)
- `GET /api/market/pulse` — Market stress score calculation (0-100 index based on signal frequency and polarity)
- `POST /api/digest/send` — Send daily email digest of top signals (via Resend)
- `GET /api/leaderboard/divergence` — Divergence Leaderboard: companies ranked by SAID vs FILED contradiction score (deduplicated by ticker)
- `GET /api/signals/{id}/context` — Async Deep Context (TinyFish) extraction for entities and forward guidance
- `GET /api/signals/{id}/ripple` — Supply chain and peer correlation effect generator
- `GET /api/correlations/graph` — Full force-graph network data structure for God's View

### Demo & Triggers
- `POST /api/demo/trigger` — Trigger a single form type (`{"ticker": "NVDA", "form": "4"}`)
- `POST /api/demo/trigger-all` — Smart trigger: runs ALL 6 form types for a ticker (`{"ticker": "TSLA"}`)
  - Resolves CIK, finds latest filing of each type (8-K, 10-K, 10-Q, S-1, 4, SC 13D), processes sequentially
  - Emits live pipeline logs via SSE, sends Telegram alerts on completion
  - Returns immediately; signals appear via Supabase Realtime

### Telegram
- `POST /api/telegram/test` — Send a test message to the configured global chat
- `GET /api/telegram/setup` — Auto-detect chat ID from bot updates
- `POST /api/telegram/connect` — Generate a per-user verification code (authenticated)
- `DELETE /api/telegram/disconnect` — Disconnect per-user Telegram (authenticated)
- `GET /api/telegram/status` — Check if current user has Telegram linked (authenticated)

### Monitoring
- `GET /api/tinyfish/stats` — TinyFish extraction statistics (total, success rate)
- `GET /api/failed-filings` — Dead-letter queue: filings that failed pipeline processing with error stage and retry count

### Email
- `POST /api/email/test` — Send a test email via Resend

---

## Database Schema

### signals

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| ticker | TEXT | Stock symbol (uppercase) |
| company | TEXT | Company name |
| filing_type | TEXT | Filing type (8-K, 10-K, 10-Q, S-1, 4, SC 13D) |
| signal | TEXT | Positive, Neutral, Risk, or Pending |
| confidence | INTEGER | 0-100 scale |
| summary | TEXT | AI-generated classification summary |
| accession_number | TEXT | Unique SEC identifier |
| filed_at | TIMESTAMPTZ | SEC filing timestamp |
| created_at | TIMESTAMPTZ | Database ingestion timestamp |
| event_type | TEXT | Taxonomy event (EARNINGS_BEAT, EXEC_DEPARTURE, IPO_REGISTRATION, etc.) |
| filing_subtype | TEXT | 8-K item number (e.g. "8-K Item 5.02") |
| filing_form | TEXT | Filing form type |
| impact_score | INTEGER | Composite importance score (0-100) |
| sentiment_delta | REAL | Filing vs news alignment (-1.0 to 1.0) |
| sentiment_match | BOOLEAN | Whether filing and news sentiment agree |
| chain_of_thought | JSONB | AI reasoning steps (6-step analysis) |
| governance_audit | JSONB | 5-check validation audit trail |
| impact_breakdown | JSONB | Score component breakdown |
| key_facts | JSONB | Extracted key facts with numbers |
| risk_factors | JSONB | Identified risk factors |
| form_data | JSONB | Form-specific data (insider details, IPO underwriters, etc.) |
| extraction_source | TEXT | Text extraction method used |
| extraction_time_ms | INTEGER | Extraction duration |
| user_correction | TEXT | User-submitted signal override |
| correction_count | INTEGER | Number of corrections received |
| config_version_at_classification | INTEGER | Agent config version when classified |

#### Enrichment Columns (29 total)

| Column | Type | Source Agent |
|--------|------|--------------|
| news_headlines | JSONB | NewsAgent |
| news_sentiment | TEXT | NewsAgent |
| news_dominant_theme | TEXT | NewsAgent |
| reddit_sentiment | REAL | SocialSentimentAgent |
| stocktwits_sentiment | REAL | SocialSentimentAgent |
| social_volume_spike | BOOLEAN | SocialSentimentAgent |
| social_vs_filing_delta | TEXT | SocialSentimentAgent |
| insider_net_30d | REAL | InsiderTransactionAgent |
| insider_net_90d | REAL | InsiderTransactionAgent |
| insider_ceo_activity | TEXT | InsiderTransactionAgent |
| insider_unusual_delay | BOOLEAN | InsiderTransactionAgent |
| congress_net_sentiment | TEXT | CongressTradingAgent |
| congress_trades | JSONB | CongressTradingAgent |
| congress_suspicious_timing | BOOLEAN | CongressTradingAgent |
| congress_timing_note | TEXT | CongressTradingAgent |
| divergence_score | INTEGER | Gemini (divergence analysis) |
| divergence_severity | TEXT | Gemini (divergence analysis) |
| divergence_type | TEXT | Gemini (divergence analysis) |
| contradiction_summary | TEXT | Gemini (divergence analysis) |
| public_claim | TEXT | DivergenceDetectionAgent + Gemini |
| filing_reality | TEXT | Gemini (divergence analysis) |
| genome_score | INTEGER | GenomeAgent |
| genome_trend | TEXT | GenomeAgent |
| genome_pattern_matches | JSONB | GenomeAgent |
| genome_alert | BOOLEAN | GenomeAgent |
| content_hash | TEXT | EDGAR Agent (SHA-256 dedup) |
| short_percent_float | REAL | market_data.get_short_interest() |
| days_to_cover | REAL | market_data.get_short_interest() |
| options_activity | JSONB | OptionsActivityAgent |
| put_call_ratio | REAL | OptionsActivityAgent |

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

### user_telegram

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to auth.users |
| telegram_chat_id | TEXT | User's Telegram chat ID |
| verified | BOOLEAN | Whether the connection is verified |

### telegram_verification_codes

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to auth.users |
| code | TEXT | 8-character verification code |
| used | BOOLEAN | Whether the code has been redeemed |
| created_at | TIMESTAMPTZ | Timestamp |

### failed_filings (Phase 10 dead-letter queue)

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| accession_number | TEXT | SEC filing identifier |
| ticker | TEXT | Stock symbol |
| filing_type | TEXT | Form type (8-K, 10-K, etc.) |
| filing_text | TEXT | Raw filing content for retry |
| error_stage | TEXT | Pipeline stage where failure occurred |
| error_message | TEXT | Exception message |
| retry_count | INTEGER | Number of retry attempts so far |
| next_retry_at | TIMESTAMPTZ | Scheduled retry time (exponential backoff: 2^retry_count minutes) |
| created_at | TIMESTAMPTZ | First failure timestamp |

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_ANON_KEY` | ✅ | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (backend only) |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key for AI classification |
| `TINYFISH_API_KEY` | ❌ | TinyFish Web Agent key (agents skip without it) |
| `USE_TINYFISH` | ❌ | Set to `false` to disable all agent calls (default: `true`) |
| `TELEGRAM_BOT_TOKEN` | ❌ | Telegram bot token |
| `TELEGRAM_CHAT_ID` | ❌ | Global Telegram chat ID |
| `TELEGRAM_ENABLED` | ❌ | Set to `true` to enable Telegram alerts |
| `CORS_ORIGINS` | ❌ | CORS allowed origins (default: `*`) |
| `RESEND_API_KEY` | ❌ | Resend API key for email digests |
| `DIGEST_EMAIL` | ❌ | Email recipient for daily digest |
| `FRONTEND_URL` | ❌ | Frontend URL for deep links in emails |

### Frontend (`frontend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `REACT_APP_SUPABASE_URL` | ✅ | Supabase project URL |
| `REACT_APP_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous key |
| `REACT_APP_BACKEND_URL` | ✅ | Backend API URL (default: `http://localhost:8001`) |

---

## Design System

AFI uses a **CSS custom property (variable) system** defined in `index.css` for full dark/light theme support. The theme is toggled by adding/removing `body.theme-light` and persisted to `localStorage`. An anti-flash inline `<script>` in `public/index.html` applies the class before React hydrates.

### Dark theme (`:root` defaults — Bloomberg/Linear-inspired)
- Background base: `--bg-base: #0F1117`
- Surface/cards: `--bg-surface: #141824`, `--bg-card: #141824`
- Sidebar: `--bg-sidebar: #0A0D14`
- Borders: `--border-default: #1E2330`, `--border-strong: #2D3748`
- Text: `--text-primary: #E2E8F0`, `--text-secondary: #94A3B8`

### Light theme (`body.theme-light` overrides)
- Background base: `--bg-base: #F8F9FB`
- Text: `--text-primary: #1E2330`

### Signal and category colors (same in both themes)
- Accent: `--accent-blue: #3B82F6`
- Signals: Positive `--signal-positive: #34D399`, Risk `--signal-risk: #F87171`, Neutral `--signal-neutral: #94A3B8`
- Category: Earnings `#34D399`, Insider `#A855F7`, Activist `#3B82F6`, Leadership `#FB923C`, Annual `#F59E0B`, Legal `#F87171`, Routine `#6B7280`
- Filing badge: 8-K `#3B82F6`, 10-K `#F59E0B`, 10-Q `#34D399`, Form 4 `#A855F7`, SC 13D `#FB923C`, S-1 `#06B6D4`

### Rules
- Border radius: 4px (cards/buttons), 6px (accordion panels), 10px (count badges)
- Fonts: Inter (UI), JetBrains Mono (tickers, data, timestamps)
- Animations: Capped at 120ms — no gradients

---

## Testing

```bash
cd backend
pip install pytest
python -m pytest tests/ -v
```

Test suites:
- `test_signal_pipeline.py` — Pipeline processing, processor registration, signal-to-DB conversion
- `test_form_s1.py` — S-1 processor classification, error handling, event type mapping
- `test_leaderboard.py` — Enrichment column mapping for genome, divergence, and insider data

---

## Roadmap

### Phase 1: Foundation ✅
- UI design system and component architecture
- Supabase authentication
- Static seed data and watchlist CRUD

### Phase 2: Core Intelligence ✅
- Supabase migration (replaced MongoDB)
- EDGAR polling agent with auto-start
- Gemini 2.5 Flash AI classification
- Telegram alerting
- Real-time dashboard with WebSocket subscriptions
- Health monitoring and AI market brief

### Phase 3: Signal Pipeline ✅
- Extensible signal pipeline with registry pattern
- Event taxonomy mapping (deterministic classification)
- Yahoo Finance market data enrichment with TTL cache
- Sentiment analysis (filing vs news tone comparison)
- Composite impact scoring (0-100)
- Price correlation tracking (T+1h, T+24h, T+3d)
- Agent config versioning and promotion queue
- Signal correction feedback loop

### Phase 4: Proactive Alerting ✅
- Smart Telegram thresholds (watchlist-aware, multi-factor)
- Rich HTML Telegram alerts
- Browser push notifications (service worker)
- Daily email digest endpoint (Resend)
- Dashboard performance: parallel fetching, caching, skeleton UI

### Phase 5: Categorized Feed & Multi-Page ✅
- Multi-page architecture (AppShell, Dashboard, Watchlist, Signal, Settings)
- Premium Landing Page (dot-grid, glassmorphism, animated feature cards)
- Categorized signal feed with 7-category accordion layout
- FeedSummaryBar with category count pills
- Compact 3-column AlertCard with priority sorting

### Phase 6: Multi-Form Architecture ✅
- 5 form-specific processors (8-K, 10-K, 10-Q, Form 4, SC 13D)
- 5-check governance validation with chain-of-thought audit trail
- Smart `trigger-all` with live SSE logs and Telegram alerts
- AlertCard intelligence: WHY line, NEWS DIVERGENCE badge, insider details
- 7-category dashboard feed
- Supabase Realtime subscription (replaced polling)
- localStorage instant rendering

### Phase 7: Intelligence Agents & Enrichment ✅
- 7 concurrent enrichment agents via `asyncio.gather`
- `enrichment_pipeline.py` with 29 enrichment columns
- TinyFish Navigator-only optimization (~12s lookup + 200ms download)
- 5-View Navigation (BRIEF, RADAR, INTEL, FEED, ALERTS)
- Bloomberg-style Signal Cards (divergence, genome, 3px confidence bar)
- Emergent Universal Key fallback for AI classification

### Phase 8 (Complete): Polish, Fix & Docs. S-1 IPO filing processor. `USE_TINYFISH` env guard on all agent calls. GenomeAgent as 7th enrichment agent with genome columns (score, trend, pattern_matches, alert). `/api/leaderboard/divergence` endpoint with ticker deduplication. Per-user Telegram: connect/disconnect/status endpoints, `dispatch_signal_alert()` with double-send prevention, `poll_telegram_commands()` background task. `SignalDetailModal.jsx` rewritten with divergence, genome, social, insider, congress, and news enrichment sections. Test files: `test_form_s1.py`, `test_leaderboard.py`. `S-1` added to trigger-all sweep forms.

### Phase 10: Pipeline Resilience, AI Quality & Theme Overhaul ✅
- **Bloomberg/Linear-inspired theme system**: CSS custom properties replacing all hardcoded hex values; dark/light toggle with `body.theme-light` + anti-flash inline script; full AppShell `useEffect` sync
- **Navigation stability**: `AppDataProvider` + `AppLayout/Outlet` pattern — AppShell mounts once per session; single global Supabase subscription; 2-strike health check before offline status; `agentStatus` cached to localStorage
- **EDGAR pipeline resilience**: Dynamic poll intervals (45s market open / 300s off-hours) by Eastern Time; top-level `_poll_loop` crash recovery (30s backoff); `thread.is_alive()` health check; EDGAR connectivity check at startup
- **11 form types**: Added DEF 14A (proxy/shareholder vote), NT 10-K, NT 10-Q (late filings), 8-K/A (amendments), CORRESP (SEC correspondence)
- **Dead-letter queue**: `failed_filings` table; pipeline wraps `_process_inner()` with error stage tracking; 10-minute retry loop with exponential backoff (2^retry_count minutes)
- **Content hash deduplication**: SHA-256 of first 5,000 chars stored in `signals.content_hash`; checked pre-pipeline to skip reruns
- **3-step CIK→ticker fallback**: SEC JSON → yfinance Search → `UNKNOWN__<CIK>`
- **FormNTProcessor**: NT 10-K / NT 10-Q always returns Risk; extracts late reason; flags restatement, going concern, SEC investigation, material weakness
- **Structured Gemini JSON schema**: `response_mime_type="application/json"` + `response_schema` enforced on all 6 processors; `call_gemini_with_retry()` with 3-attempt backoff on 429 errors
- **Earnings quantification**: 9 financial metric fields on 8-K and 10-Q (actual/consensus EPS & revenue, surprise %, guidance direction/magnitude, next-quarter EPS guide)
- **Short interest enrichment**: `market_data.get_short_interest()` returns `short_percent_float`, `short_ratio`, `days_to_cover`
- **8th enrichment agent** (`OptionsActivityAgent`): detects unusual options volume (>3× open interest), put/call ratio, options sentiment
- **"God's View" Graph overhaul**: CSS variable colors; theme-aware canvas labels; historical signal timeline on node click; zoom-to-fit; redesigned header with signal legend
- **`GET /api/failed-filings`** endpoint added for dead-letter queue visibility
- **`React.memo`** with custom comparator on AlertCard (skips re-renders unless id, user_correction, or impact_score change)

### Phase 9: Deep Context & Global UI ✅
- **Async Deep Context Enrichment** (`tinyfish_context.py` + `TinyFishContext.jsx`): Fire-and-forget background extraction of named entities, financial figures, forward guidance, and risk language using SEC EFTS API. Frontend features an 8-second "live enrichment" illusion.
- **"God's View" Correlation Network** (`Graph.jsx` + `/api/correlations/graph`): 2D force-directed graph mapping macro dependencies across 10 sectors. Features pulsing nodes for active signals, directional particles for supply chains, and interactive signal badges.
- **Market Pulse** (`MarketPulse.jsx` + `/api/market/pulse`): 0-100 real-time market stress index indicator powered by cross-signal analysis, rendered in the global top navigation.
- **Sector Ripple Drawer** (`RippleDrawer.jsx` + `/api/signals/{id}/ripple`): Collapsible UI inside signal cards that enumerates affected customers, suppliers, and peers with live price feeds and directional impact.

### Phase 12: Pipeline Reliability & SDK Hardening ✅
- **google-genai SDK**: Fully migrated to `google-genai` v1.65+ (`from google import genai`). `google-generativeai` removed.
- **Gemini model chain**: `gemini-2.5-flash` → `gemini-2.5-flash-lite` → `gemini-2.0-flash` → `gemini-2.0-flash-lite`. 503/overload handled with 3s/6s/9s tiered retry. `max_output_tokens` raised to 2048 to prevent JSON truncation.
- **conf:0 Pending dropped**: Zero-confidence classification failures are no longer stored — they go to the dead-letter queue. Feed only shows real signals.
- **Junk filter**: Real tickers (`^[A-Z]{1,5}$`) always pass. Only unresolved `UNKNOWN__<CIK>` placeholders with trivially short keyword-analysis summaries are discarded.
- **Leaderboard fix**: Removed non-existent `classification` column from Supabase query. Fallback now uses `impact_score DESC` when no divergence data exists.
- **DB migration**: `content_hash`, `failed_filings` table, and all enrichment columns added. Indexes on `content_hash` and `divergence_score`.
- **TinyFish batch timeouts**: 10-K/S-1 increased to 120s, 10-Q to 90s. Default max wait 120s.

### Phase 11: TinyFish Hackathon Sprint ✅
- **Form-specific extraction strategy**: `EXTRACTION_STRATEGY` dict routes each form type to the optimal method. Static HTML forms (8-K, 4, SC 13D, S-1, DEF 14A, NT) use direct HTTP (~1-2s). Annual reports (10-K) use SEC XBRL Company Facts API + Submissions API (~3s, returning structured `$637B Revenue`, `$3.23 EPS` data). Eliminates 685-second TinyFish timeout on 200+ page documents.
- **TinyFish as enrichment showcase**: `_tinyfish_enrich_market_context()` runs as the 9th agent in `asyncio.gather`. Fetches Yahoo Finance (JS-rendered — real TinyFish use case) for live price, volume, market cap, and analyst rating in parallel with all other agents. Stored as `tf_*` enrichment columns.
- **Bloomberg 3-panel Graph**: `Graph.jsx` rebuilt as `220px | 1fr | 260px` grid. Left: sector list with live counts + active signals list. Center: force graph with stat bar + link type filter pills. Right: selected company detail with latest signal, correlation peers with type badges, and TRIGGER SWEEP button.
- **EDGAR Atom feed polling**: Primary polling source switched from broken EFTS wildcard (`q=*` returns 0 results) to EDGAR Atom feed (`/cgi-bin/browse-edgar?output=atom`). New `_parse_atom_feed()` handles Atom namespace correctly with regex fallback. Returns 10+ entries per form type.
- **EFTS query fix**: No-q format (`forms=8-K&dateRange=custom&startdt=...`) confirmed returning 100+ results as secondary source.
- **Gemini model stabilized**: All files use `google.genai` SDK (deprecated `google.generativeai` removed). Model pinned to `gemini-2.5-flash` (confirmed working on standard API keys). Fallback chain: `gemini-1.5-flash` → `gemini-1.5-flash-8b`. 404 responses automatically rotate to next model.
- **Divergence scoring**: `signal_pipeline.py` computes divergence after enrichment (Positive filing + negative news = `POSITIVE_FILING_NEGATIVE_NEWS`, scored 40-85). Powers the Divergence Leaderboard.
- **Pipeline status endpoint**: `GET /api/pipeline/status` — `signals_24h`, `good_signals_24h`, `avg_confidence`, `edgar_running`, `status`.
- **Startup cleanup**: Deletes stale Pending/confidence-0 signals older than 1 hour on boot.