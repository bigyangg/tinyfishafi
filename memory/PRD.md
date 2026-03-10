# AFI — Autonomous Filing Intelligence
## Product Requirements Document

**Status:** Phase 2 Complete
**Date:** March 2026
**Version:** 2.0.0

---

## Original Problem Statement
Build AFI — a regulatory intelligence dashboard for retail investors displaying AI-processed SEC filing alerts in real time.

---

## Architecture

**Frontend:** React (CRA + Craco), React Router v7, Tailwind CSS (0px border-radius / dark mode), JetBrains Mono + Inter fonts
**Backend:** FastAPI (Python), Supabase Auth (email + password), Supabase PostgreSQL
**Database:** Supabase (signals, watchlist tables with Realtime enabled)
**AI:** Claude Sonnet (claude-sonnet-4-20250514) via Anthropic SDK for filing classification
**Web Agent:** TinyFish Web Agent API for EDGAR filing text extraction
**Alerts:** Telegram Bot API for signal delivery
**Auth:** Supabase Auth with admin create + sign_in_with_password, session managed by `@supabase/supabase-js`

---

## User Personas
1. **Retail Investor:** Wants to know what's happening with their 5-10 holdings without reading 8-K filings manually
2. **Active Trader:** Needs real-time regulatory intelligence to act before news cycle picks it up
3. **Institutional Desk (Phase 3+):** Wants API access and white-label capabilities

---

## Core Requirements
- Landing page: "AI That Reads SEC Filings So You Don't Have To." headline, Start Free Trial CTA
- Auth: email/password signup + login via Supabase Auth
- Dashboard: Alert Feed with signal cards, 60s polling + Supabase realtime subscriptions
- Agent Status Bar: last poll time, UP/DOWN badge, filings processed today
- Signal Detail Modal: full summary, signal badge, confidence, filing type, company, filed date, EDGAR link
- Watchlist: search + add up to 10 tickers per user, stored in Supabase, filters alert feed, realtime sync
- EDGAR Agent: polls every 5 min, TinyFish/HTTP extraction, Claude Sonnet classification
- Telegram Bot: formatted alerts on new signals
- Pricing page: 3 tiers (Retail $19, Pro $99, Enterprise custom)
- Dark mode only, Inter + JetBrains Mono, electric blue #0066FF accent, 0px border-radius

---

## What's Been Implemented

### Phase 1 (Feb 2026) — Dashboard Shell
- Landing, Auth, Dashboard, Pricing pages
- JWT auth with MongoDB (now replaced)
- 10 hardcoded seed signals
- Watchlist CRUD

### Phase 2 (Mar 2026) — Live Intelligence
- **Supabase migration**: replaced MongoDB with Supabase for auth, signals, watchlist
- **EDGAR polling agent**: `edgar_agent.py` polls SEC EDGAR EFTS every 5 min for 8-K filings
- **AI classification**: Claude Sonnet classifies filings as Positive/Neutral/Risk with confidence score
- **TinyFish integration**: Web Agent API extracts filing text from EDGAR pages
- **Telegram bot**: `telegram_bot.py` sends formatted alerts with signal emoji
- **Realtime dashboard**: Supabase realtime subscriptions for instant signal + watchlist updates
- **Agent status bar**: shows last poll time, UP/DOWN badge, filings count
- **Signal detail modal**: clickable alert cards open full detail overlay with EDGAR link
- **Graceful degradation**: missing ANTHROPIC_API_KEY stores Pending signals, Telegram failures never crash agent

### Backend Routes
- `POST /api/auth/signup` — Supabase Auth create user + sign in
- `POST /api/auth/login` — Supabase Auth sign in
- `GET /api/auth/me` — validate Supabase JWT
- `GET /api/signals` — from Supabase `signals` table (ordered desc)
- `GET /api/signals?tickers=AAPL,NVDA` — filtered by tickers
- `GET /api/watchlist` — user's watchlist from Supabase
- `POST /api/watchlist` — add ticker (max 10)
- `DELETE /api/watchlist/{ticker}` — remove ticker
- `GET /api/edgar/status` — agent status
- `POST /api/edgar/start` — start polling loop
- `POST /api/edgar/stop` — stop polling loop

---

## Prioritized Backlog

### P0 — Phase 3
- [ ] REST API access for Pro tier
- [ ] Signal feedback loop (user votes on accuracy)
- [ ] Market reaction correlation data
- [ ] Stripe billing (Retail $19, Pro $99)

### P1 — Phase 3 Features
- [ ] Semantic diff/change detection on 10-K sections
- [ ] 10-K, 10-Q, S-1 filing type support
- [ ] High Risk (4th class) signal scoring
- [ ] Email alerts (SendGrid)
- [ ] Company search autocomplete

### P2 — Phase 4 Platform
- [ ] White-label API
- [ ] Institutional tier
- [ ] International filings
- [ ] Mobile app (React Native)
