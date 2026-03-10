# CLAUDE.md - AFI Architecture and Context Specification

## Project Definition

**AFI (Autonomous Filing Intelligence)**
A regulatory intelligence dashboard designed for active retail and institutional traders. AFI monitors SEC EDGAR filings asynchronously, processes them utilizing the Google Gemini AI model (gemini-1.5-flash), generates standard signal classifications (Positive, Neutral, Risk) with assigned confidence intervals, and disseminates this intelligence via a real-time dashboard and programmatic Telegram alerts.

**Current State:** Phase 2 (Completed) - Live active feed, Supabase authentication/storage, Gemini AI integration, real-time client-side synchronization, Telegram alerting.

---

## Architectural Topology

```text
FastAPI Backend (Port: 8001) <-> Supabase <-> Supabase Auth
EDGAR Polling Subprocess -> SEC EDGAR -> Gemini API -> Supabase -> Telegram Bot
React Client (Port: 3000) -> Supabase Realtime + /api/* REST endpoints
```

**Routing Constraint:** All backend API routes must strictly utilize the `/api/` prefix to comply with Kubernetes ingress configurations.

---

## File System Structure

### Backend Infrastructure
*   `/backend/server.py`: Primary FastAPI application. Manages authentication delegation to Supabase Auth, routes signals and watchlists, and exposes endpoints to control the EDGAR agent.
*   `/backend/edgar_agent.py`: Asynchronous 8-K polling agent. Extracts document text via TinyFish or direct HTTP, routes to Gemini for semantic classification, and triggers alerts.
*   `/backend/telegram_bot.py`: Dispatches alerts utilizing the Telegram API, handling internal error states without crashing the main subprocess.
*   `/backend/.env`: Environment vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TINYFISH_API_KEY`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `USE_TINYFISH`, `TELEGRAM_ENABLED`, `CORS_ORIGINS`.

### Client Architecture
*   `/frontend/src/App.js`: Application router utilizing `ProtectedRoute` component design.
*   `/frontend/src/lib/supabase.js`: Global Supabase client instance.
*   `/frontend/src/context/AuthContext.jsx`: Supabase Auth state implementation mapping signup flows through backend admin APIs.
*   `/frontend/src/pages/Dashboard.jsx`: Primary protected console housing the alert feed, real-time subscription mechanisms, and system status indicators.
*   `/frontend/src/components/AlertCard.jsx`: Interactive unit representing an individual classification event.
*   `/frontend/src/components/SignalDetailModal.jsx`: Modal presenting the full intelligence summary and external navigation to the primary SEC document.

### Technical and Thematic Constraints (Non-Negotiable)
1.  **Background Theme:** `#050505` (Dark mode architecture only).
2.  **Surface/Component Theme:** `#0A0A0A`.
3.  **Accent Color:** `#0066FF` (Strictly reserved for primary interactive states).
4.  **Signal Color Mapping:** Positive (`#00C805`), Risk (`#FF3333`), Neutral (`#71717A`).
5.  **Border Radius:** 0px exclusively globally.
6.  **Typography:** Inter (Primary Interface), JetBrains Mono (Data-heavy components, tickers, timestamps, financial output).
7.  **Animation Restrictions:** Strictly limited. UI transitions capped at 75ms. No gradients allowed.

---

## Data Modeling

### Supabase Table: `signals`
| Column | Data Type | Properties |
|--------|-----------|------------|
| `id` | UUID | Primary Key, Auto-generated |
| `ticker` | TEXT | Enforced Uppercase |
| `filing_type` | TEXT | Document schema identifier (e.g., "8-K") |
| `signal` | TEXT | Enum values: Positive, Neutral, Risk, Pending |
| `company` | TEXT | Standardized corporate entity identifier |
| `summary` | TEXT | Short-form LLM output summary |
| `confidence` | INTEGER | Machine confidence score (0-100) |
| `accession_number` | TEXT | Unique SEC constraint identifier |
| `filed_at` | TIMESTAMPTZ | SEC registration timestamp |
| `created_at` | TIMESTAMPTZ | Internal registration timestamp |

**API Translation Constraint:** The API translates `signal` to `classification` and `company` to `company_name` for precise client parity via `format_signal_for_api()`.

---

## Authentication Mechanism

1.  Client triggers signup intent via UI.
2.  Route `POST /api/auth/signup` calls `supabase.auth.admin.create_user()` utilizing the backend service role, bypassing RLS.
3.  Secondary automated login executes `sign_in_with_password()`, pushing standard JWT to frontend context.
4.  React `AuthContext` consumes this JWT session locally and handles subsequent state verifications.

---

## EDGAR Agent Specification

*   Interval: Configured to 300 seconds (5 minutes) targeting EDGAR EFTS APIs.
*   Deduplication: Validation run against Supabase `accession_number` constraint prior to scraping.
*   Scraping Engine: Defaults to TinyFish Web Agent API (`USE_TINYFISH=true`) with implicit HTTP regex fallback mechanism.
*   LLM Classification: Google Gemini 1.5 Flash generates deterministic JSON payload representing regulatory impact.
*   Resilience Mechanisms: Key-related authentication failures result in a `Pending` event status with silent alert suppression, preventing background service failure.

---

## Strategic Roadmap Alignment

### Current: Phase 2 Core Engine Complete
*   Supabase migration completed.
*   EDGAR 8-K polling agent finalized.
*   Gemini API classification stabilized.
*   Telegram external notification service live.
*   Real-time client telemetry implemented.

### Incoming: Phase 3 Objectives
1.  REST API abstraction for programmatic endpoint queries (Pro tier specific).
2.  Algorithmic feedback loop interface allowing human validation on machine classifications.
3.  Price correlation matrix cross-referencing signals with 1-hour market reactions.

### Future: Phase 4
1.  Processing support across wider filing ranges (10-K, 10-Q, S-1).
2.  Institutional B2B white-label offerings.
3.  Mobile progressive web app and international financial reporting integrations.
