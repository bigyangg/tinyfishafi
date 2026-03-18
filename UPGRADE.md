1You are the AFI principal architect. This is the final comprehensive 
completion sprint. Work through all 5 phases in order. Do not skip 
any task. After each phase, report what was changed before moving on.

=============================================================
PHASE 1 — FIX EDGAR DATA PIPELINE (do this before anything else)
=============================================================

The system is not pulling SEC filings reliably. This is the #1 priority.

--- 1A. Diagnose and fix the EDGAR agent offline issue ---

In server.py, find the startup event that calls edgar_agent.start(). 
Wrap it in explicit try/catch and add structured logging so any startup 
failure prints the full exception to stdout. Currently failures are silent.

Add this health check function to edgar_agent.py:

  async def check_edgar_connectivity() -> dict:
      """Called at startup and exposed via /api/health"""
      try:
          url = "https://efts.sec.gov/LATEST/search-index?q=%228-K%22&dateRange=custom&startdt=2024-01-01&enddt=2024-01-02"
          async with httpx.AsyncClient(timeout=10.0) as client:
              r = await client.get(url)
              return {"reachable": r.status_code == 200, "latency_ms": r.elapsed.total_seconds() * 1000}
      except Exception as e:
          return {"reachable": False, "error": str(e)}

Call this at startup. If not reachable, log a CRITICAL error but do 
not crash — keep retrying every 60 seconds.

--- 1B. Fix CIK → ticker resolution ---

In edgar_agent.py, the resolve_ticker_from_cik() function currently 
fails silently for ~30% of filings where the SEC submissions JSON 
doesn't include a ticker. Add a 3-step fallback chain:

  Step 1: Try data.sec.gov/submissions/CIK{padded}.json → tickers field
  Step 2: If empty, try data.sec.gov/submissions/CIK{padded}.json → 
          name field → search yfinance with company name → extract ticker
  Step 3: If still empty, store the filing with ticker="UNKNOWN__{CIK}" 
          and add to a reconciliation queue for manual review.

Never drop a filing because the ticker lookup failed.

--- 1C. Add dead-letter queue for failed filings ---

Create a new Supabase table called failed_filings:

  CREATE TABLE failed_filings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    accession_number TEXT UNIQUE NOT NULL,
    form_type TEXT,
    company TEXT,
    cik TEXT,
    filed_at TIMESTAMPTZ,
    error_stage TEXT,       -- 'extraction', 'classification', 'enrichment', 'storage'
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    next_retry_at TIMESTAMPTZ DEFAULT NOW(),
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

In signal_pipeline.py, wrap the entire process() method in try/catch. 
On any unhandled exception, insert into failed_filings instead of 
letting the filing disappear. 

Add a background task that runs every 10 minutes, queries 
failed_filings WHERE resolved=FALSE AND retry_count < 3 
AND next_retry_at <= NOW(), and retries each one with exponential 
backoff (next_retry_at = NOW() + interval '2^retry_count minutes').

Expose at GET /api/failed-filings for the ops dashboard.

--- 1D. Improve polling frequency and form coverage ---

In edgar_agent.py, change the polling interval logic:

  import pytz
  from datetime import datetime

  def get_poll_interval() -> int:
      et = pytz.timezone('America/New_York')
      now = datetime.now(et)
      hour = now.hour
      if 4 <= hour < 9:      # Pre-market: high activity
          return 45
      elif 9 <= hour < 16:   # Market hours
          return 90
      elif 16 <= hour < 20:  # After-hours earnings
          return 60
      else:                  # Overnight
          return 300

Add these form types to the FORM_TYPES polling list in edgar_agent.py:
  "DEF 14A"  -- proxy statements (executive pay, board changes)
  "NT 10-K"  -- late filing notice (major red flag signal)
  "NT 10-Q"  -- late quarterly notice (major red flag signal)  
  "8-K/A"    -- amended 8-K (company correcting prior disclosure)
  "CORRESP"  -- SEC comment letters (regulatory scrutiny signal)

Add processors for NT 10-K and NT 10-Q in processors/:
  - These are simple: any NT filing = automatic Risk signal, 
    confidence 85, event_type = LATE_FILING_NOTICE
  - Extract the reason text from the filing for the summary

--- 1E. Add content hash deduplication ---

In edgar_agent.py, after extracting filing text, compute:
  import hashlib
  content_hash = hashlib.sha256(filing_text[:5000].encode()).hexdigest()

Add content_hash column to the signals table:
  ALTER TABLE signals ADD COLUMN content_hash TEXT;
  CREATE INDEX idx_signals_content_hash ON signals(content_hash);

Before calling signal_pipeline.process(), check:
  existing = await supabase.table('signals')
      .select('id').eq('content_hash', content_hash).execute()
  if existing.data:
      logger.info(f"Skipping duplicate filing {accession_number}")
      continue

=============================================================
PHASE 2 — AI SIGNAL QUALITY
=============================================================

--- 2A. Enforce structured Gemini output ---

In ALL form processors (form_8k.py, form_10k.py, form_10q.py, 
form_4.py, form_sc13d.py, form_s1.py), replace free-text JSON 
parsing with enforced schema output:

  from google.genai import types

  response_schema = {
      "type": "OBJECT",
      "properties": {
          "signal": {"type": "STRING", "enum": ["Positive", "Neutral", "Risk"]},
          "confidence": {"type": "INTEGER"},
          "summary": {"type": "STRING"},
          "event_type": {"type": "STRING"},
          "key_facts": {"type": "ARRAY", "items": {"type": "STRING"}},
          "risk_factors": {"type": "ARRAY", "items": {"type": "STRING"}},
          "chain_of_thought": {"type": "ARRAY", "items": {"type": "STRING"}}
      },
      "required": ["signal", "confidence", "summary", "event_type"]
  }

  generation_config = types.GenerationConfig(
      response_mime_type="application/json",
      response_schema=response_schema
  )

This eliminates all JSON parse errors on malformed Gemini responses.

--- 2B. Add earnings quantification ---

In form_10q.py and form_8k.py, extend the prompt to extract:

  "Extract these as numbers (null if not found):
   - actual_eps: reported EPS this quarter (number)
   - consensus_eps: analyst consensus EPS if mentioned (number)
   - eps_surprise_pct: percentage beat/miss vs consensus (number)
   - actual_revenue_millions: reported revenue in millions (number)
   - consensus_revenue_millions: consensus revenue if mentioned (number)  
   - revenue_surprise_pct: percentage beat/miss (number)
   - guidance_direction: one of 'raised', 'lowered', 'maintained', 'withdrawn', 'none'
   - guidance_magnitude_pct: how much guidance changed in % (number or null)
   - next_quarter_eps_guide: guided EPS for next quarter (number or null)"

Store all these in form_data JSONB. Display in AlertCard as:
  EPS: $2.14 vs $1.98E (+8.1%) | Rev: $19.2B vs $18.8E (+2.1%)
  Guidance: RAISED +4%

--- 2C. Add Gemini retry with backoff ---

In signal_pipeline.py, wrap every Gemini API call in:

  async def call_gemini_with_retry(prompt: str, max_retries: int = 3) -> dict:
      for attempt in range(max_retries):
          try:
              response = await asyncio.to_thread(
                  model.generate_content, prompt, 
                  generation_config=generation_config
              )
              return json.loads(response.text)
          except Exception as e:
              if "429" in str(e) or "quota" in str(e).lower():
                  wait = 2 ** attempt
                  logger.warning(f"Gemini rate limited, waiting {wait}s")
                  await asyncio.sleep(wait)
              elif attempt == max_retries - 1:
                  raise
              else:
                  await asyncio.sleep(1)
      raise Exception("Gemini failed after max retries")

--- 2D. Add late filing risk processor ---

Create processors/form_nt.py:

  class FormNTProcessor:
      """NT 10-K and NT 10-Q processor — late filing notice = automatic risk"""
      
      async def process(self, filing_text: str, ticker: str, form_type: str) -> dict:
          # Extract reason from filing text using Gemini
          reason_prompt = f"""
          This is an SEC {form_type} (notification of late filing).
          Extract: the stated reason for the late filing, 
          and whether it mentions: auditor issues, restatements, 
          going concern, SEC investigation, or material weakness.
          Return JSON: {{"reason": "...", "severity_flags": ["..."]}}
          
          Filing text: {filing_text[:3000]}
          """
          
          reason_data = await call_gemini_with_retry(reason_prompt)
          
          severity = "CRITICAL" if any(flag in ["restatement", "going_concern", 
              "sec_investigation", "material_weakness"] 
              for flag in reason_data.get("severity_flags", [])) else "HIGH"
          
          return {
              "signal": "Risk",
              "confidence": 88,
              "event_type": "LATE_FILING_NOTICE",
              "summary": f"{ticker} filed {form_type}: {reason_data.get('reason', 'No reason provided')}",
              "key_facts": [f"Late filing notice: {form_type}", reason_data.get("reason", "")],
              "risk_factors": reason_data.get("severity_flags", []),
              "form_data": {"late_filing_reason": reason_data.get("reason"), 
                           "severity": severity,
                           "severity_flags": reason_data.get("severity_flags", [])}
          }

Register in signal_pipeline.py:
  pipeline.register_processor("NT 10-K", FormNTProcessor())
  pipeline.register_processor("NT 10-Q", FormNTProcessor())
  pipeline.register_processor("8-K/A", Form8KProcessor())  # reuse 8K processor

=============================================================
PHASE 3 — MARKET DATA ENRICHMENT
=============================================================

--- 3A. Add short interest to market_data.py ---

  def get_short_interest(ticker: str) -> dict:
      """Get current short interest data"""
      try:
          stock = yf.Ticker(ticker)
          info = stock.info
          return {
              "short_percent_float": info.get("shortPercentOfFloat", 0) * 100,
              "short_ratio": info.get("shortRatio", 0),    # days to cover
              "shares_short": info.get("sharesShort", 0),
              "short_previous_month": info.get("sharesShortPreviousMonthDate", None)
          }
      except:
          return {}

Add short_percent_float and short_ratio columns to signals table:
  ALTER TABLE signals ADD COLUMN short_percent_float REAL;
  ALTER TABLE signals ADD COLUMN days_to_cover REAL;

In signal_pipeline.py, call get_short_interest() alongside existing 
market data fetch and store in the signal.

In AlertCard.jsx, show short interest context:
  If short_percent_float > 20 AND signal = "Positive": 
    show badge "HIGH SHORT 24%" in amber — potential squeeze setup
  If short_percent_float > 30: show badge in red

--- 3B. Add options unusual activity detection ---

Create agents/options_agent.py:

  class OptionsActivityAgent(BaseAgent):
      """Detect unusual options activity around filing time"""
      
      async def run(self, ticker: str, filing_date: str) -> dict:
          try:
              stock = yf.Ticker(ticker)
              options_dates = stock.options
              if not options_dates:
                  return {}
              
              # Get nearest expiry options
              nearest = options_dates[0]
              chain = stock.option_chain(nearest)
              calls = chain.calls
              puts = chain.puts
              
              # Flag unusual: volume > 3x open interest
              unusual_calls = calls[calls['volume'] > calls['openInterest'] * 3]
              unusual_puts = puts[puts['volume'] > puts['openInterest'] * 3]
              
              total_call_volume = int(calls['volume'].sum())
              total_put_volume = int(puts['volume'].sum())
              put_call_ratio = round(total_put_volume / max(total_call_volume, 1), 2)
              
              return {
                  "put_call_ratio": put_call_ratio,
                  "unusual_calls_count": len(unusual_calls),
                  "unusual_puts_count": len(unusual_puts),
                  "options_signal": "bearish" if put_call_ratio > 1.5 else 
                                   "bullish" if put_call_ratio < 0.5 else "neutral",
                  "largest_call_strike": float(unusual_calls['strike'].max()) if len(unusual_calls) > 0 else None,
                  "largest_put_strike": float(unusual_puts['strike'].min()) if len(unusual_puts) > 0 else None
              }
          except Exception as e:
              logger.warning(f"Options agent failed for {ticker}: {e}")
              return {}

Add to enrichment_pipeline.py's asyncio.gather() call as the 8th agent.
Add options_put_call_ratio, options_signal columns to signals table.
Show in AlertCard: "P/C: 0.34 BULLISH" badge when options_signal != neutral.

--- 3C. Add earnings calendar context ---

In market_data.py:

  def get_earnings_date(ticker: str) -> dict:
      try:
          stock = yf.Ticker(ticker)
          cal = stock.calendar
          if cal is not None and 'Earnings Date' in cal:
              earnings_dt = cal['Earnings Date'][0]
              days_away = (earnings_dt - datetime.now()).days
              return {
                  "next_earnings_date": earnings_dt.isoformat(),
                  "days_to_earnings": days_away,
                  "earnings_imminent": days_away <= 7
              }
          return {}
      except:
          return {}

Store days_to_earnings in signals table.
In AlertCard, show "EARNINGS IN 3D" warning badge when days_to_earnings <= 7.
This is critical context — a 10-Q filed 3 days before earnings is a 
completely different signal than one filed 3 months before.

--- 3D. Add pre/post market price tracking ---

In price_tracker.py, add pre/post market snapshots:

  After storing a signal, schedule these additional checks:
  - T+0: current regular session price (existing)
  - T+premarket: next day 7AM ET pre-market price
  - T+postmarket: same day 5PM ET post-market price (if after-hours filing)

  Use yfinance with prepost=True parameter:
  hist = yf.Ticker(ticker).history(period="1d", interval="1m", prepost=True)

Add price_premarket and price_postmarket columns to price_correlations.

=============================================================
PHASE 4 — DASHBOARD UPGRADES
=============================================================

--- 4A. Add signal velocity sparkline to topbar ---

In MarketPulse.jsx, add a mini 24-bar sparkline showing filing count 
per hour for the last 24 hours. Fetch from new endpoint:

Backend: GET /api/signals/velocity
  Returns: array of {hour: "14:00", count: 7} for last 24 hours
  Query: SELECT date_trunc('hour', created_at) as hour, count(*) 
         FROM signals WHERE created_at > NOW() - INTERVAL '24 hours'
         GROUP BY hour ORDER BY hour

Frontend: render as a tiny 60px wide, 20px tall SVG sparkline in 
the topbar. Green bars, with the current hour highlighted brighter.
Add tooltip: "14 filings in the last hour (avg: 6)"

--- 4B. Add earnings beat/miss display to AlertCard ---

In AlertCard.jsx, when signal.form_data contains eps_surprise_pct:

  Show a prominent data row below the WHY line:
  
  EPS: $2.14 vs $1.98E  [+8.1%]   Rev: $19.2B vs $18.8E  [+2.1%]
  
  Color the surprise percentage: green if positive, red if negative.
  Use JetBrains Mono font for all numbers.
  
  If guidance_direction exists:
  Show "GUIDANCE RAISED +4%" or "GUIDANCE CUT -7%" badge.
  This should be MORE prominent than the EPS beat — guidance 
  moves stocks more than current quarter results.

--- 4C. Add late filing alert styling ---

In AlertCard.jsx, for signals with event_type = "LATE_FILING_NOTICE":
  - Show red left border (3px) on the card
  - Show "LATE FILING" badge in red at top
  - Show the NT form type badge in red (not blue)
  - In the WHY line, show the extracted reason
  - If severity_flags includes "restatement" or "going_concern": 
    add a "CRITICAL" badge and pin card to top of feed

--- 4D. Add short interest + options context to SignalDetailModal ---

In SignalDetailModal.jsx, add a new "MARKET CONTEXT" section below 
the existing enrichment sections:

  Section header: "MARKET CONTEXT"
  
  Row 1: Short Interest
  - Short float %: [24.3%] [HIGH]  
  - Days to cover: [4.2d]
  - Interpretation: "Elevated short interest — squeeze risk if positive catalyst"
  
  Row 2: Options Flow (if available)
  - Put/Call ratio: [0.34] [BULLISH]
  - Unusual calls: [12 contracts] / Unusual puts: [2 contracts]
  
  Row 3: Earnings Calendar (if days_to_earnings exists)
  - Next earnings: [Mar 24] (in 6 days)
  - Warning badge if earnings_imminent: "EARNINGS IN 6D — filing timing is significant"

--- 4E. Add sector heat map to dashboard ---

Create a new component SectorHeatMap.jsx.

Query: GET /api/signals/sector-summary
Backend: 
  SELECT event_type, signal, COUNT(*) as count,
         AVG(confidence) as avg_confidence,
         AVG(impact_score) as avg_impact
  FROM signals 
  WHERE created_at > NOW() - INTERVAL '24 hours'
  GROUP BY event_type, signal

Frontend: render as a 3-column grid of sector tiles, each showing:
  - Sector name
  - Filing count badge
  - Color-coded by dominant signal (green=mostly positive, red=mostly risk)
  - Average impact score bar

Place above the FeedSummaryBar in Dashboard.jsx. 
Collapse to a single row on mobile.

=============================================================
PHASE 5 — PRODUCTION HARDENING
=============================================================

--- 5A. Add structured logging ---

Install structlog: pip install structlog

In server.py, replace all print() and logging.info() calls with:

  import structlog
  logger = structlog.get_logger()
  
  # Each log event includes context automatically:
  logger.info("filing_processed", 
              ticker=ticker, 
              form_type=form_type,
              trace_id=trace_id,
              duration_ms=duration,
              stage="classification",
              confidence=result.confidence)

Add trace_id generation at the start of each filing:
  import uuid
  trace_id = str(uuid.uuid4())[:8]  # short for readability

This trace_id should appear in EVERY log line for that filing, 
making it trivial to trace a filing's journey from EDGAR → storage.

Store trace_id in signals table for correlation with logs.

--- 5B. Add /api/metrics endpoint ---

Create a new endpoint that returns system performance metrics:

  GET /api/metrics returns:
  {
    "edgar_agent": {
      "status": "running",
      "last_poll_at": "...",
      "filings_today": 47,
      "filings_this_hour": 6,
      "failed_today": 2,
      "avg_processing_ms": 4200
    },
    "gemini": {
      "calls_today": 47,
      "success_rate_pct": 95.7,
      "avg_latency_ms": 3100,
      "rate_limit_hits_today": 1
    },
    "enrichment": {
      "agents_enabled": 8,
      "avg_success_rate_pct": 87.3,
      "tinyfish_calls": 120,
      "tinyfish_success_rate": 91.0
    },
    "pipeline": {
      "signals_stored_today": 45,
      "avg_confidence": 73.2,
      "positive_pct": 41,
      "risk_pct": 28,
      "neutral_pct": 31
    }
  }

Track these metrics in memory (reset daily) using a simple 
PipelineMetrics dataclass in server.py. Increment counters 
from signal_pipeline.py callbacks.

Display a subset of these metrics on the /runs page as a 
live stats dashboard.

--- 5C. Verify and test all EDGAR form types ---

Using afi-qa-reliability agent, run this test suite:

  For each form type (8-K, 10-K, 10-Q, S-1, 4, SC 13D, 
  NT 10-K, NT 10-Q, DEF 14A, 8-K/A):
  
  1. Query EDGAR EFTS for the 3 most recent filings of this type
  2. Run each through the full pipeline
  3. Verify: signal is not "Pending", confidence > 0, 
             summary is not empty, key_facts has entries
  4. Verify: enrichment columns are populated (not all null)
  5. Verify: signal appears in Supabase within 60 seconds
  6. Report success/fail count per form type

Print a summary table:
  Form Type | Tested | Passed | Failed | Avg Confidence | Avg Process Time
  8-K       |   3    |   3    |   0    |     78%        |    4.2s
  NT 10-K   |   3    |   3    |   0    |     88%        |    2.1s
  ...

Any form type with >1 failure must be debugged before marking 
Phase 5 complete.

--- 5D. Final checklist ---

After all phases complete, verify:

[ ] EDGAR agent starts automatically when server.py starts
[ ] EDGAR connectivity check passes (SEC EFTS reachable)
[ ] At least 10 real filings processed without errors in one poll cycle
[ ] All 10 form types return non-Pending signals
[ ] Failed filings table exists and retry logic works
[ ] Gemini rate limit retry works (test by temporarily lowering quota)
[ ] Short interest data appears in signal detail modal
[ ] Options flow data populates for major tickers (NVDA, AAPL, TSLA)
[ ] Earnings calendar badge shows on signals within 7 days of earnings
[ ] NT 10-K/NT 10-Q signals automatically classified as Risk
[ ] Sector heat map visible on dashboard
[ ] /api/metrics returns valid data
[ ] /api/failed-filings returns empty or populated list
[ ] Content hash dedup prevents duplicate signals on re-poll
[ ] All structured logs include trace_id
[ ] Theme toggle persists across page reload (from previous prompt)
[ ] Navigation between all pages has no visible freeze

Report back with final status of every checklist item.
=============================================================
END OF MASTER PROMPT
=============================================================