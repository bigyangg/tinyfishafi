# Product Requirements Document
**Application:** AFI - Autonomous Filing Intelligence
**Current Phase:** Phase 2 Complete (Preparing Phase 3 Scoping)
**Version Control Date:** March 2026

---

## Executive Summary

AFI is a regulatory monitoring framework engineered to parse SEC EDGAR filings asynchronously. Utilizing artificial intelligence to execute natural language processing on regulatory raw text, AFI extracts and flags material corporate events prior to downstream aggregate news dissemination. The application provides categorized signal alerts directly through a low-latency web dashboard and secure mobile channels.

---

## Architectural Configuration

**Client Presentation Layer:** React (CRA with Craco), React Router v7, Tailwind CSS (Strict dark mode, zero radius UI rules), JetBrains Mono + Inter font stack.
**API Application Layer:** FastAPI (Python), interacting as a secure proxy to Database services.
**Authentication Mechanism:** Supabase Auth (Native Email + Password integration).
**Database Layer:** Supabase PostgreSQL with active real-time WebSockets tracking document additions.
**Intelligence Engine:** Google Gemini (gemini-1.5-flash) specifically prompted for financial context tagging.
**Web Agent Layer:** TinyFish Web Agent API for headless EDGAR navigation and text extraction.
**Notification Layer:** Telegram Bot API for programmatic alert broadcasting.

---

## Target Client Personas

1.  **Retail Trader:** Requires high-level distillation of 5-15 active holdings without the overhead of manual SEC monitoring.
2.  **Algorithmic / Active Trader:** Demands real-time API or webhook event triggers regarding material developments to dictate manual execution entries or algorithmic rebalancing.
3.  **Institutional Research:** Requires a programmatic white-label data hose for integration into proprietary existing trading models.

---

## Critical Functional Requirements

*   **Public Landing:** Conversion-optimized marketing entry emphasizing the core AI value proposition.
*   **Authentication Flow:** Standard account registration and session management bound to Supabase backend structure.
*   **System Dashboard:** Continuous intelligence feed integrating real-time database WebSocket subscriptions.
*   **Agent Telemetry Bar:** Status visualization tracking continuous polling intervals, functional health, and absolute processed volumes for the active session.
*   **Signal Examination Modal:** Granular UI representation providing machine-generated summary, confidence rating, entity association, and primary SEC EDGAR document linking.
*   **Watchlist Management:** Parameterized search isolating intelligence strictly relevant to a user-defined subset of 10 tracked assets.
*   **EDGAR Engine:** Persistent background cron sequence querying current-day SEC regulatory endpoints on a five-minute block.
*   **Machine Pipeline:** Automatic semantic ingestion of primary document contents utilizing Gemini models for deterministic JSON outputs.
*   **External Broadcasting:** Real-time push transmission of confirmed analytical events via Telegram endpoints.
*   **UX/UI Constraints:** Enforced monochromatic dark theme `#050505` utilizing rigid boundary boxes and limited animation properties ensuring high professional data output presentation.

---

## Development Milestones

### Phase 1: Foundational Scaffolding (Completed February 2026)
*   Client and backend framework instantiated.
*   Static seed data injected displaying target UI specifications.
*   Auth and Watchlist data structures isolated and mapped.
*   Initial CSS baseline established according to strict layout properties.

### Phase 2: Autonomous Intelligence Actuation (Completed March 2026)
*   **Database Migration:** Fully integrated Supabase, replacing generic MongoDB iterations for enhanced scaling and security.
*   **EDGAR Crawler Activation:** `edgar_agent.py` successfully querying direct SEC database endpoints.
*   **Gemini Implementation:** Upgraded the AI classification node to Google Gemini 1.5 Flash producing verifiable metadata formatting.
*   **Data Scraper Verification:** TinyFish Web agent integration for heavy Document Object Model extraction and subsequent backend delivery.
*   **Live WebSockets Integration:** Frontend correctly receiving background Supabase data insertions and executing non-destructive state mutations.
*   **Alert Generation:** Telemetric deployment to verified client Telegram devices.
*   **Error Management Framework:** Graceful failure on missing API configurations ensuring zero core system halting routines.

---

## Implementation Backlog (Priority Sequenced)

### P0 - Phase 3 Requirements
*   Build and secure a dedicated REST API gateway endpoint restricted to Pro-tier subscribers.
*   Engineer a quantitative client feedback loop (Thumbs Up / Down tracking) to fine-tune AI accuracy parameters.
*   Implement 1-hour and 24-hour stock price tracking matrix connected directly to signal timestamp events.
*   Deploy Stripe standard billing models tracking active subscriber usage parameters.

### P1 - Advanced Platform Functionality
*   Develop semantic differential analysis comparing 10-K quarter-over-quarter and year-over-year text deviations.
*   Expand classification schemas to include full 10-K, 10-Q, and S-1 documentation analysis.
*   Categorize a high-priority sub-alert structure named `Catalyst` for highest predictive outcomes.
*   Provide robust Company internal autocomplete searching against active SEC entity identifiers.

### P2 - Enterprise Scale
*   Engineer Institutional White-Label API service parameters.
*   Investigate and map international filing systems (e.g., European ESMA, Canadian SEDAR) for parity processing.
*   Release standalone compiled mobile client instances tracking precise notification channels.
