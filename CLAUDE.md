# CLAUDE.md - AFI Architecture Reference

## Overview

AFI (Market Event Intelligence) is a real-time signal platform for traders. It polls SEC EDGAR continuously, detects new filings (8-K, 10-K, 10-Q, 4, SC 13D, S-1, NT 10-K, NT 10-Q, DEF 14A, 8-K/A, CORRESP), classifies market events with Gemini 2.5 Flash, applies 5-stage governance validation, enriches with 8 concurrent agents, scores impact (0–100), and delivers structured signals through a live dashboard, Telegram alerts, and server-sent events (SSE) logs.

**Current state:** Phase 12 — Pipeline Reliability & SDK Hardening complete. Full migration to `google-genai` SDK (`from google import genai`), Gemini model chain updated to `gemini-2.5-flash` → `gemini-2.5-flash-lite` → `gemini-2.0-flash`, 503/overload retry logic, `max_output_tokens` increased to 2048, conf:0 Pending signals dropped (not stored), junk filter updated to keep all real tickers via regex, leaderboard `classification` column bug fixed, DB schema fully migrated (`content_hash`, `failed_filings`, enrichment columns), and TinyFish batch timeouts doubled for large forms.

---

## Architecture

```
FastAPI (port 8001) <-> Supabase (PostgreSQL + Auth + Realtime)
EDGAR Agent (dynamic interval: 45-300s) -> SEC EDGAR Atom Feed (primary) + EFTS no-q (fallback)
  -> Multi-Form Pipeline -> Governance -> Score -> Store -> Alert
Text Extraction Strategy (per form type):
  8-K/4/SC13D/S-1/DEF14A: HTTP direct (~1-2s, static HTML)
  10-K/10-K/A:             SEC XBRL Company Facts API + Submissions API (~3s, structured JSON)
  10-Q/10-Q/A:             SEC XBRL API then HTTP fallback
  NT 10-K/NT 10-Q:         HTTP direct (very short notices)
TinyFish: Reserved for JS-rendered enrichment (Yahoo Finance market context, 9th parallel agent)
Ticker Resolution: SEC JSON -> yfinance search -> UNKNOWN__<CIK> fallback (never drops a filing)
Content Dedup: SHA-256(filing_text[:5000]) checked against signals.content_hash before processing
Dead-Letter Queue: failed_filings table + 10-min retry loop (exponential backoff, max 3 attempts)
Signal Pipeline: Classify (Gemini 2.5 Flash structured JSON) -> Taxonomy -> Divergence -> Enrich (9 agents) -> Score -> Store -> Alert
Enrichment Agents (asyncio.gather): edgar, news, social, insider, congress, divergence, genome, options, tinyfish_market
Price Tracker (300s loop) -> Yahoo Finance -> price_correlations table
React (port 3000) -> AppDataProvider (single Supabase subscription) -> AppLayout (single AppShell) -> Pages
Gemini: google-genai SDK (from google import genai), model=gemini-2.5-flash, fallback chain: gemini-2.5-flash-lite -> gemini-2.0-flash -> gemini-2.0-flash-lite
  503/overload: tiered wait 3s/6s/9s before retry. max_output_tokens=2048 everywhere.
  conf:0 Pending signals dropped at pipeline (not stored). Junk filter: re.match(r'^[A-Z]{1,5}$') keeps all real tickers.
```

All backend routes use the `/api/` prefix.

---

## Key Files

### Backend — Core
- `server.py` - FastAPI app. Signal/watchlist CRUD, SSE stream (`/api/logs/stream`), demo triggers (`/api/demo/trigger`, `/api/demo/trigger-all`), dead-letter queue (`/api/failed-filings`), TinyFish stats, agent control. Auto-starts EDGAR agent with connectivity check and logs `=== AFI SERVER READY ===` on success. Wraps expensive synchronous AI workflows in `asyncio.to_thread`.
- `edgar_agent.py` - Autonomous SEC poller. Monitors 11 form types. Dynamic poll interval via `get_poll_interval()` (45/90/60/300s by market hour). **3-step ticker fallback**: SEC JSON → yfinance search → `UNKNOWN__<CIK>`. **Content hash dedup**: skips filings with duplicate SHA-256. Thread uses `_stop_event.wait()` chunked sleep so `stop()` interrupts within 1s. `get_status()` uses `thread.is_alive()` — never lies about agent state. `check_edgar_connectivity()` called at startup.
- `telegram_bot.py` - Smart Telegram alerts with multi-factor thresholds. Double-send prevention. Per-user verified chat dispatch.

### Backend — Pipeline
- `intelligence/enrichment_pipeline.py` - Orchestrator for **9 concurrent agents** (8 domain agents + `_tinyfish_enrich_market_context`). Runs `asyncio.gather` with all 9. TinyFish fetches Yahoo Finance live market data (price, change%, volume, market cap, analyst rating) in parallel. Maps 30+ enrichment columns.
- `intelligence/tinyfish_context.py` - Fire-and-forget Deep Context extractor: entities, financial figures, forward guidance, risk language via SEC EFTS.
- `backend/agents/` - `base_agent` (12s timeout, graceful failure) + 8 agents: edgar, news, social, insider, congress, divergence, genome, **options**. All run via `asyncio.gather`.
- `signal_pipeline.py` - Registry pattern orchestrator. Wraps `_process_inner()` in try/except; on failure inserts to `failed_filings`. Tracks `current_stage` for error attribution. Registers: 8-K, 10-K, 10-Q, 4, SC 13D, S-1, NT 10-K, NT 10-Q, 8-K/A.
- `processors/form_8k.py` - Structured Gemini schema + earnings quantification (EPS, revenue, guidance fields).
- `processors/form_10q.py` - Structured Gemini schema + earnings quantification (9 financial metric fields).
- `processors/form_10k.py`, `form_4.py`, `form_sc13d.py`, `form_s1.py` - All use enforced `response_schema` with `response_mime_type="application/json"`.
- `processors/form_nt.py` - **New.** NT 10-K / NT 10-Q processor. Always returns Risk signal (85–92% confidence). Extracts late-filing reason and severity flags (restatement, going_concern, sec_investigation, material_weakness).
- `processors/gemini_helper.py` - `call_gemini_async()` / `call_gemini()` / `classify_sync()` using `google-genai` SDK (`from google import genai`). Thread-safe singleton via `threading.Lock()`. Model chain: `gemini-2.5-flash` → `gemini-2.5-flash-lite` → `gemini-2.0-flash` → `gemini-2.0-flash-lite`. 503/overload handling with 3s/6s/9s tiered wait. 429 rate-limit: exponential backoff. 404: resets singleton, tries next model. `max_output_tokens=2048`. Pure sync — no asyncio in hot path; safe from EDGAR poll thread.
- `governance.py` - 5 validation checks: CONFIDENCE_FLOOR, NEWS_DIVERGENCE, KEY_FACTS_PRESENT, EVENT_SIGNAL_CONSISTENCY, JUNK_FILTER.
- `market_data.py` - Yahoo Finance wrapper. 5-min TTL cache. Added `get_short_interest()` returning `short_percent_float`, `short_ratio`, `shares_short`.
- `sentiment_analyzer.py` - Filing signal vs current news tone. Returns delta, news score, match boolean.
- `impact_engine.py` - Composite scoring: 40% confidence + 30% event weight + 20% sentiment + 10% watchlist boost.
- `price_tracker.py` - T+1h/T+24h/T+3d price checks. Database rows, survives restarts.

### Frontend
- `App.js` - Routes via `AppLayout` (single persistent `AppShell` via React Router `Outlet`). `AppDataProvider` wraps the router. Public routes: `/`, `/auth`.
- `context/AppDataContext.jsx` - **Global persistent state.** Single Supabase Realtime subscription (never torn down). Polls `edgar/status` every 20s, `health` every 30s. Caches signals + agent status in localStorage. `backendOnline` requires 2 consecutive failures before showing offline. All protected pages read from this context.
- `context/AuthContext.jsx` - Supabase Auth state.
- `components/AppShell.jsx` - Layout shell. Mounts **once** (via `AppLayout`). Reads `agentStatus`, `backendOnline`, `filedToday`, `nextPoll` from `AppDataContext`. Theme toggle (☀/☾) persisted to localStorage. `useEffect` keeps `body.theme-light` class in sync with `isLight` state.
- `pages/Dashboard.jsx` - 5-view navigation (BRIEF/RADAR/INTEL/FEED/ALERTS). Uses `useAppData()` — no local signal fetching. `CATEGORY_MAP` → 7 accordion groups.
- `pages/Graph.jsx` - Force-graph with CSS-variable colors, theme-aware canvas node labels, sector filter pills, **historical signal timeline** on node click (fetches last 5 signals), zoom-to-fit button, dot-grid background.
- `pages/Leaderboard.jsx` - Divergence leaderboard with CRITICAL/HIGH/MEDIUM/LOW severity badges.
- `pages/Logs.jsx`, `Runs.jsx`, `Watchlist.jsx`, `Settings.jsx`, `Signal.jsx` - All use `useAppData()`, no AppShell wrapper (provided by AppLayout).
- `components/AlertCard.jsx` - `React.memo` with custom comparator (id + user_correction + impact_score). All colors via CSS variables.
- `components/MarketPulse.jsx`, `SignalDetailModal.jsx`, `TinyFishContext.jsx`, `RippleDrawer.jsx`, `SignalSkeleton.jsx` - All CSS-variable themed.
- `public/index.html` - Anti-flash inline script: applies `theme-light` class before React loads if localStorage preference is set.
- `index.css` - `:root` dark tokens, `body.theme-light` light tokens (no `@media prefers-color-scheme` — manual toggle only). Tailwind `--background`/`--foreground` synced to theme.

### Environment Variables
**Backend (.env):** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TINYFISH_API_KEY`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `USE_TINYFISH`, `TELEGRAM_ENABLED`, `CORS_ORIGINS`, `RESEND_API_KEY` (optional), `DIGEST_EMAIL` (optional), `FRONTEND_URL` (optional)

**Frontend (.env):** `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`, `REACT_APP_BACKEND_URL`

---

## Claude Code Agents

AFI uses a structured **Multi-Agent Orchestration Protocol** via Claude Code. Instead of treating Claude as a single general-purpose assistant, invoke specific **Custom Agents** tailored to architectural domains.

### Active Agents (`.claude/agents/`)
1. **`afi-principal-architect`**: The top-level orchestrator. Invoke this for cross-cutting concerns, system-wide upgrades, or major debugging efforts. It understands the interaction between async backend, React frontend, and AI pipelines.
2. **`afi-backend-engineer`**: Focuses on `server.py`, `edgar_agent.py`, `signal_pipeline.py`, and async fastAPI latency/fault tolerance.
3. **`afi-frontend-engineer`**: Focuses on React rendering performance, Supabase Realtime consistency, and the strict design system.
4. **`afi-ai-systems-engineer`**: Focuses on Gemini prompts, deterministic classification, zero-hallucination governance, and TinyFish extraction accuracy.
5. **`afi-qa-reliability`**: Focuses on test coverage, regression prevention, failure injection, and end-to-end simulation.

**Usage:** When starting Claude Code in the terminal (`claude`), use the `/agent` command to switch to the appropriate persona, or ask the Principal Architect to coordinate a sub-agent for the task.

---

## Data Model

### signals table
`id` (UUID), `ticker`, `company`, `filing_type` (8-K, 10-K, etc), `signal` (Positive/Neutral/Risk/Pending), `confidence` (INT 0-100), `summary`, `accession_number` (unique), `filed_at`, `created_at`
**Phase 6 Audit Columns:** `chain_of_thought` (JSONB), `governance_audit` (JSONB), `impact_breakdown` (JSONB), `news_headlines` (JSONB), `news_sentiment` (TEXT), `divergence_type` (TEXT), `key_facts` (JSONB), `form_data` (JSONB), `extraction_source` (TEXT), `extraction_time_ms` (INT).

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
4. Category colors: Earnings `#00C805`, Insider `#A855F7`, Activist `#0066FF`, Leadership `#FF6B00`, Annual `#F59E0B`, Legal `#FF3333`, Routine `#555`
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
| POST | /api/demo/trigger | Single form-type demo pipeline trigger |
| POST | /api/demo/trigger-all | Smart trigger: all 6 form types + TG alerts |
| GET | /api/tinyfish/stats | TinyFish extraction statistics |
| GET | /api/signals/{id} | Full signal with audit trail |
| GET | /api/leaderboard/divergence | Divergence Leaderboard (deduplicated by ticker) |
| POST | /api/telegram/connect | Generate per-user Telegram verification code |
| DELETE | /api/telegram/disconnect | Disconnect per-user Telegram |
| GET | /api/telegram/status | Check if current user has Telegram connected |
| GET | /api/signals/{id}/context | Async Deep Context (TinyFish) extraction for entities and forward guidance |
| GET | /api/signals/{id}/ripple | Supply chain and peer correlation effect generator |
| GET | /api/correlations/graph | Full force-graph network data structure for God's View |
| GET | /api/market/pulse | Market stress score calculation (0-100 index) |

---

## Pipeline Behavior (Phase 7 Intelligence)

- Filing received → form-specific text extraction (HTTP/XBRL API/TinyFish based on `EXTRACTION_STRATEGY`)
- Step 1: Form-specific processor calls Gemini 2.5 Flash with structured JSON schema + chain-of-thought
- Step 2: event_classifier maps to taxonomy (deterministic, ~0ms)
- Step 3: governance.py runs 5 validation checks (confidence floor, news divergence, key facts, event consistency, junk filter)
- Step 4: market_data fetches price + news (cached, 2s timeout)
- Step 5: sentiment_analyzer compares filing vs news tone (~1ms)
- Step 6: Divergence scoring — compares filing signal vs news/social sentiment → score 0-100, type, severity (NONE/LOW/MEDIUM/HIGH/CRITICAL)
- Step 7: impact_engine scores composite importance (0-100) with governance penalty
- Step 7b: Enrichment pipeline fires 9 concurrent agents via `asyncio.gather` (edgar, news, social, insider, congress, divergence, genome, options, tinyfish_market)
- Step 8: Store enriched signal + audit trail in Supabase (34+ columns)
- Step 9: Schedule price checks (T+1h, T+24h, T+3d)
- Step 10: Alert via Telegram if impact >= threshold

Registry pattern: `pipeline.register_processor("4", Form4Processor())` — active for all registered form types.

**EXTRACTION_STRATEGY** (`agents/edgar_filing_agent.py`):
- `http_direct`: 8-K, 8-K/A, 4, SC 13D, S-1, DEF 14A, NT 10-K, NT 10-Q — static HTML, ~1-2s
- `sec_api_primary`: 10-K, 10-K/A — SEC XBRL Company Facts + Submissions APIs, ~3s, returns structured financial JSON
- `sec_api_then_http`: 10-Q, 10-Q/A — XBRL API first, HTTP fallback

**TinyFish usage** (hackathon showcase):
- NOT used for static SEC EDGAR pages (no performance benefit, LLM guard issues)
- USED as 9th enrichment agent: `_tinyfish_enrich_market_context()` fetches Yahoo Finance (JS-rendered) for live price, volume, market cap, analyst rating in parallel with all other agents

### Error Handling

Every pipeline step has isolated error handling with contextual logging:
- Classification failure (Step 2) → conf:0 Pending signals are **dropped** (not stored); filing goes to `failed_filings` dead-letter queue for retry
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

**Phase 6 (Complete):** Multi-form architecture: Form 4 insider processor (buy/sell), 10-K annual report processor, 10-Q quarterly earnings (beat/miss), SC 13D activist filing processor. 5-check governance validation with full audit trail. Chain-of-thought AI reasoning. Smart demo trigger (`trigger-all`) with live SSE logs and Telegram alerts. AlertCard intelligence (WHY line, NEWS DIVERGENCE badge, insider transaction details). 7-category feed. TinyFish stats endpoint. localStorage instant rendering. Gemini SDK migration to `google.genai`.

**Phase 7 (Complete):** Intelligence Agents & Enrichment pipeline. Built `backend/agents/` with 7 concurrent agents (base_agent, edgar, news, social, insider, congress, divergence, genome) using `asyncio.gather`. TinyFish Navigator-only pattern optimizations (~12s lookup + 200ms download). `intelligence/enrichment_pipeline.py` adds 20+ enrichment columns and Gemini divergence analysis. 5-View Navigation (BRIEF, RADAR, INTEL, FEED, ALERTS). Bloomberg-style Signal Cards (divergence, genome alert, 3px confidence bar). Emergent Universal Key fallback for AI classification. Telegram bot HTML fixes and Resend email service integration.

**Phase 8 (Complete):** Polish, Fix & Docs. S-1 IPO filing processor. `USE_TINYFISH` env guard on all agent calls. GenomeAgent as 7th enrichment agent with genome columns (score, trend, pattern_matches, alert). `/api/leaderboard/divergence` endpoint with ticker deduplication. Per-user Telegram: connect/disconnect/status endpoints, `dispatch_signal_alert()` with double-send prevention, `poll_telegram_commands()` background task. `SignalDetailModal.jsx` rewritten with divergence, genome, social, insider, congress, and news enrichment sections. Test files: `test_form_s1.py`, `test_leaderboard.py`. `S-1` added to trigger-all sweep forms.

**Phase 9 (Complete):** Deep Context & Global UI. Async Deep Context Enrichment (`tinyfish_context.py` + `TinyFishContext.jsx`) for entities, financial figures, forward guidance, and risk language. "God's View" Correlation Network (`Graph.jsx` + `/api/correlations/graph`) rendering 2D force-directed macro dependencies. Market Pulse (`MarketPulse.jsx` + `/api/market/pulse`) 0-100 real-time market stress index. Sector Ripple Drawer (`RippleDrawer.jsx` + `/api/signals/{id}/ripple`) for supply chain impact tracking.

**Phase 11 (Complete):** TinyFish Hackathon Sprint.
- **Form-specific extraction strategy**: `EXTRACTION_STRATEGY` dict in `edgar_filing_agent.py` routes each form type to the optimal method. Static SEC HTML → `http_direct` (~1-2s). 10-K/10-Q → `sec_api_primary` using SEC XBRL Company Facts + Submissions APIs (~3s, returns `$39.3B Revenue`, `$3.23 EPS` structured data). No more 685-second TinyFish timeouts on annual reports.
- **TinyFish as enrichment showcase**: `_tinyfish_enrich_market_context()` runs as the 9th agent in `asyncio.gather`, fetching live Yahoo Finance data (JS-rendered page) — price, change%, volume, market cap, analyst rating — in parallel. Stored as `tf_price`, `tf_change_pct`, `tf_volume`, `tf_market_cap`, `tf_analyst_rating` in enrichment data.
- **Bloomberg 3-panel Graph**: `Graph.jsx` rebuilt with `220px | 1fr | 260px` grid layout. Left panel: sector list with counts + active signals. Center: force graph with filter pills + stats bar. Right panel: company detail, latest signal, correlation peers, TRIGGER SWEEP button.
- **EDGAR Atom feed polling**: `_parse_atom_feed()` + `poll_edgar_atom_feed()` added. SEC Atom feed (`/cgi-bin/browse-edgar?output=atom`) is primary source, replacing broken EFTS wildcard `q=*` query. Returns 10 entries per form type with correct namespace handling.
- **EFTS query fix**: Removed `q=*` / `q=%2A` (returns 0 results). New query uses no `q` parameter — returns all filings in date range. Confirmed 100+ hits with total=698.
- **Gemini model fix**: All files migrated to `google.genai` SDK (not deprecated `google.generativeai`). Model pinned to `gemini-2.5-flash` (confirmed working). Fallback chain: `gemini-1.5-flash` → `gemini-1.5-flash-8b`. 404 responses reset model selection to try next in chain.
- **Divergence scoring in pipeline**: `signal_pipeline.py` computes divergence after enrichment — compares `filing_signal` vs `news_sentiment`/`social_avg`. Stores `divergence_score`, `divergence_type`, `divergence_details`. Powers the Leaderboard.
- **Leaderboard fallback**: `/api/leaderboard/divergence` backfills with high-confidence signals when divergence_score data is sparse.
- **Junk filter loosened**: Only discards signals with confidence < 25 AND summary < 30 chars AND ROUTINE_FILING event type AND no real filing text.
- **Pipeline status endpoint**: `GET /api/pipeline/status` returns `signals_24h`, `good_signals_24h`, `avg_confidence`, `edgar_running`, `status`.
- **Startup cleanup**: On boot, deletes stale Pending signals (confidence=0, older than 1 hour).

**Phase 12 (Complete):** Pipeline Reliability & SDK Hardening.
- **google-genai SDK migration**: All files now use `from google import genai` (new unified SDK, v1.65+). `google-generativeai` (deprecated) fully removed from codebase and `requirements.txt`. `get_client()` thread-safe singleton via `threading.Lock()`.
- **Gemini model chain updated**: `gemini-2.5-flash` → `gemini-2.5-flash-lite` → `gemini-2.0-flash` → `gemini-2.0-flash-lite`. `gemini-2.5-flash-lite` added as immediate fallback (lighter, less likely to 503).
- **503 overload handling**: New error branch in `classify_sync()` and `call_gemini()` catches `503`/`overloaded`/`unavailable` and waits 3s, 6s, 9s (tiered, not exponential) before retry.
- **JSON truncation fix**: `max_output_tokens` increased from 1024 → **2048** everywhere in `gemini_helper.py`. Prevents "Unterminated string" parse errors on long classification responses.
- **conf:0 Pending dropped**: `signal_pipeline.py` now drops any signal with `confidence=0` or `signal=Pending` instead of storing it. These polluted the feed. Filing routed to `failed_filings` dead-letter queue for automatic retry.
- **Junk filter hardened**: `_is_junk_signal()` uses `re.match(r'^[A-Z]{1,5}$', ticker)` to keep all real company tickers unconditionally. `UNKNOWN__<CIK>` placeholders discarded only if confidence ≤ 55 AND summary is trivially short ("keyword analysis" < 80 chars).
- **Leaderboard `classification` column bug fixed**: Removed non-existent `classification` column from both Supabase select queries in `/api/leaderboard/divergence`. Added `divergence_type`, `event_type`, `impact_score`. Fallback now orders by `impact_score DESC` (not confidence) when no divergence data exists.
- **DB schema fully migrated**: Ran SQL migration adding `content_hash`, `why_it_matters`, `market_impact`, `category_primary/secondary`, `tags`, `related_entities`, `chain_reactions`, `correlations`, `sector`, `divergence_score/severity/type`, `contradiction_summary`. Indexes on `content_hash` and `divergence_score`. `failed_filings` table created.
- **TinyFish batch timeouts doubled**: `tinyfish_batch.py` — 10-K: 70s → 120s, 10-Q: 60s → 90s, S-1: 70s → 120s, SC 13D: 50s → 60s, `DEFAULT_MAX_WAIT`: 60s → 120s. Poll interval: 3s → 4s.
