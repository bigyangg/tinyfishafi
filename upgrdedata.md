Three critical issues to fix completely. Work through all of them.
Do not skip any step. Report changes after each section.

=============================================================
ISSUE A — PIPELINE PRODUCING ONLY 8 SIGNALS/DAY (should be 40-80)
=============================================================

--- A1. Diagnose what is actually failing ---

Run these immediately:

  cd backend
  
  # Check how many signals in last 5 days and their conf distribution
  python3 - <<'EOF'
  import os
  from dotenv import load_dotenv
  load_dotenv()
  from supabase import create_client
  
  sb = create_client(os.environ["SUPABASE_URL"], 
                     os.environ["SUPABASE_SERVICE_ROLE_KEY"])
  
  # Signals by confidence bucket
  r = sb.table("signals").select(
      "id,ticker,filing_type,signal,confidence,created_at,event_type"
  ).gte("created_at","2026-03-14T00:00:00Z").order(
      "created_at", desc=True
  ).execute()
  
  data = r.data or []
  print(f"Total signals last 5 days: {len(data)}")
  
  conf_0 = [s for s in data if s['confidence'] == 0]
  conf_low = [s for s in data if 0 < s['confidence'] < 40]
  conf_ok = [s for s in data if s['confidence'] >= 40]
  
  print(f"conf=0 (dead): {len(conf_0)}")
  print(f"conf 1-39 (weak): {len(conf_low)}")
  print(f"conf 40+ (good): {len(conf_ok)}")
  
  pending = [s for s in data if s['signal'] == 'Pending']
  print(f"Pending signals: {len(pending)}")
  
  # Form type breakdown
  from collections import Counter
  forms = Counter(s['filing_type'] for s in data)
  print(f"\nBy form type: {dict(forms)}")
  
  # Last 5 signals
  print("\nLast 5 signals:")
  for s in data[:5]:
      print(f"  {s['ticker']} {s['filing_type']} "
            f"{s['signal']} conf:{s['confidence']} "
            f"{s['created_at'][:19]}")
  EOF
  
  # Check EDGAR agent last poll time and error rate
  grep -i "error\|failed\|exception\|conf.*0\|Pending" \
    logs/app.log 2>/dev/null | tail -30 || \
  python3 -c "
  import subprocess
  result = subprocess.run(
    ['journalctl', '-u', 'afi', '-n', '50', '--no-pager'],
    capture_output=True, text=True
  )
  print(result.stdout[-3000:] if result.stdout else 'No systemd logs')
  "

Paste the output and identify:
  - Is conf:0 the main problem?
  - Is the agent stopping between polls?
  - Are certain form types never being processed?

--- A2. Fix the polling interval and scope ---

In edgar_agent.py, find the main polling function.
Verify it is querying a WIDE enough date range:

  # WRONG — only gets filings from today
  params = {"dateRange": "custom", 
            "startdt": today, "enddt": today}
  
  # RIGHT — gets last 3 days to catch anything missed
  from datetime import datetime, timedelta
  three_days_ago = (datetime.now() - timedelta(days=3)).strftime("%Y-%m-%d")
  today = datetime.now().strftime("%Y-%m-%d")
  params = {"dateRange": "custom",
            "startdt": three_days_ago, "enddt": today}

Also verify the EDGAR EFTS query URL is correct:

  CORRECT_URL = (
      "https://efts.sec.gov/LATEST/search-index?"
      "q=%22%22"                          # empty query = all filings
      "&forms=8-K,10-K,10-Q,S-1,4,SC+13D"
      "&dateRange=custom"
      f"&startdt={three_days_ago}"
      f"&enddt={today}"
      "&hits.hits.total.value=true"
      "&hits.hits._source.file_date=true"
      "&hits.hits._source.period_of_report=true"
      "&hits.hits._source.entity_name=true"
      "&hits.hits._source.file_num=true"
      "&hits.hits._source.accession_no=true"
      "&hits.hits._source.form_type=true"
  )
  
  # Test this right now:
  import httpx, asyncio
  async def test():
      async with httpx.AsyncClient(timeout=15.0) as c:
          r = await c.get(CORRECT_URL)
          data = r.json()
          total = data.get("hits",{}).get("total",{}).get("value",0)
          hits = data.get("hits",{}).get("hits",[])
          print(f"EDGAR returned {total} total filings")
          print(f"First hit: {hits[0] if hits else 'NONE'}")
  asyncio.run(test())

--- A3. Fix the deduplication — it may be blocking too aggressively ---

The accession_number dedup check may be preventing re-processing
of filings that previously failed with conf:0.

In edgar_agent.py, change the dedup check:

  # CURRENT (wrong) — skips anything seen before, even failures
  existing = await sb.table("signals")\
      .select("id")\
      .eq("accession_number", accession_number)\
      .execute()
  if existing.data:
      continue  # ← skips even if previous attempt gave conf:0
  
  # FIXED — only skip if previous attempt SUCCEEDED (conf > 0)
  existing = await sb.table("signals")\
      .select("id,confidence")\
      .eq("accession_number", accession_number)\
      .execute()
  if existing.data:
      prev_conf = existing.data[0].get("confidence", 0)
      if prev_conf > 0:
          continue  # already classified successfully
      else:
          # Previous attempt failed — delete and retry
          await sb.table("signals")\
              .delete()\
              .eq("accession_number", accession_number)\
              .execute()
          log_message(f"Retrying failed signal: {accession_number}")

--- A4. Add a backfill run to recover lost filings ---

Run this one-time backfill to process filings from the last 5 days
that either failed or were never processed:

  # In edgar_agent.py or as a standalone script backfill.py:
  
  async def backfill_recent_filings(days_back: int = 5):
      """Process all EDGAR filings from last N days"""
      from datetime import datetime, timedelta
      
      log_message(f"Starting {days_back}-day backfill...")
      
      start = (datetime.now() - timedelta(days=days_back))\
              .strftime("%Y-%m-%d")
      end = datetime.now().strftime("%Y-%m-%d")
      
      # Get all filings from EDGAR for this period
      url = (
          f"https://efts.sec.gov/LATEST/search-index?"
          f"q=%22%22&forms=8-K,10-K,10-Q,S-1,4,SC+13D"
          f"&dateRange=custom&startdt={start}&enddt={end}"
          f"&hits.hits.total.value=true"
      )
      
      async with httpx.AsyncClient(timeout=20.0) as client:
          r = await client.get(url)
          data = r.json()
          hits = data.get("hits", {}).get("hits", [])
          total = data.get("hits", {}).get("total", {}).get("value", 0)
          
          log_message(f"Backfill: found {total} filings to check")
          
          processed = 0
          skipped = 0
          
          for hit in hits:
              src = hit.get("_source", {})
              accession = src.get("accession_no", "")
              
              if not accession:
                  continue
              
              # Check if already successfully processed
              existing = await sb.table("signals")\
                  .select("id,confidence")\
                  .eq("accession_number", accession)\
                  .execute()
              
              if existing.data and existing.data[0].get("confidence",0) > 0:
                  skipped += 1
                  continue
              
              # Process this filing through the full pipeline
              try:
                  await process_single_filing(src)
                  processed += 1
                  await asyncio.sleep(0.5)  # rate limit
              except Exception as e:
                  log_message(f"Backfill error {accession}: {e}")
          
          log_message(
              f"Backfill complete: {processed} processed, "
              f"{skipped} already done"
          )
  
  # Add API endpoint to trigger backfill manually:
  @app.post("/api/edgar/backfill")
  async def trigger_backfill(background_tasks: BackgroundTasks):
      background_tasks.add_task(backfill_recent_filings, 5)
      return {"status": "backfill started", "days": 5}

After adding this, immediately call:
  curl -X POST http://localhost:8001/api/edgar/backfill

Then watch /api/logs/stream to see it processing.

--- A5. Fix the polling loop to never stop ---

In edgar_agent.py, the main loop MUST survive any error:

  async def run_edgar_agent_loop():
      consecutive_failures = 0
      
      while True:
          try:
              count = await poll_edgar_once()
              consecutive_failures = 0  # reset on success
              log_message(f"Poll complete: {count} new filings processed")
              
          except asyncio.CancelledError:
              log_message("EDGAR agent shutting down gracefully")
              break
              
          except httpx.TimeoutException:
              consecutive_failures += 1
              log_message(
                  f"EDGAR poll timeout "
                  f"(failure #{consecutive_failures}) — retrying in 30s"
              )
              await asyncio.sleep(30)
              continue
              
          except Exception as e:
              consecutive_failures += 1
              log_message(
                  f"EDGAR poll error #{consecutive_failures}: "
                  f"{type(e).__name__}: {str(e)[:200]}"
              )
              
              if consecutive_failures >= 5:
                  log_message(
                      "5 consecutive failures — waiting 5 minutes"
                  )
                  await asyncio.sleep(300)
                  consecutive_failures = 0
              else:
                  await asyncio.sleep(30)
              continue
          
          # Dynamic interval based on market hours
          from datetime import datetime
          import pytz
          et = pytz.timezone("America/New_York")
          hour = datetime.now(et).hour
          
          if 4 <= hour < 9:
              interval = 45   # pre-market: filings cluster here
          elif 9 <= hour < 16:
              interval = 90   # market hours
          elif 16 <= hour < 21:
              interval = 60   # after-hours earnings
          else:
              interval = 300  # overnight: slow down
          
          log_message(f"Next poll in {interval}s")
          await asyncio.sleep(interval)

=============================================================
ISSUE B — RADAR PAGE COMPLETELY EMPTY
=============================================================

--- B1. Find and diagnose Radar.jsx ---

  cat frontend/src/pages/Radar.jsx 2>/dev/null || \
  grep -rn "Radar\|RADAR\|radar" frontend/src/ \
    --include="*.jsx" -l

  # Also check what the backend returns for radar data
  curl http://localhost:8001/api/signals?limit=100 | \
    python3 -c "
  import json,sys
  data = json.load(sys.stdin)
  print(f'Total signals: {len(data)}')
  if data:
      print(f'Sample created_at: {data[0].get(\"created_at\")}')
      print(f'Sample filed_at: {data[0].get(\"filed_at\")}')
      print(f'Keys: {list(data[0].keys())[:10]}')
  "

--- B2. Fix Radar.jsx data fetching and day bucketing ---

The Radar page needs to:
1. Fetch signals from the last 7 days
2. Group them by day of week (Mon-Fri)
3. Display signal cards in each day column

Find Radar.jsx and replace the data logic entirely:

  import { useState, useEffect } from 'react';
  import { useAppData } from '../context/AppDataContext';

  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL 
                   || 'http://localhost:8001';

  export default function Radar() {
    const { signals: contextSignals } = useAppData();
    const [weekSignals, setWeekSignals] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      const buildWeek = async () => {
        try {
          // Fetch last 7 days of signals
          const r = await fetch(
            `${BACKEND_URL}/api/signals?limit=200`
          );
          const allSignals = await r.json();
          
          // Build Mon-Fri of current week
          const today = new Date();
          const currentDay = today.getDay(); // 0=Sun, 1=Mon...
          
          // Get Monday of this week
          const monday = new Date(today);
          monday.setDate(
            today.getDate() - (currentDay === 0 ? 6 : currentDay - 1)
          );
          monday.setHours(0, 0, 0, 0);
          
          const weekDays = [];
          for (let i = 0; i < 5; i++) {
            const day = new Date(monday);
            day.setDate(monday.getDate() + i);
            weekDays.push(day);
          }
          
          // Bucket signals into days
          // Use BOTH filed_at and created_at as fallback
          const bucketed = {};
          weekDays.forEach(day => {
            bucketed[day.toDateString()] = {
              date: day,
              signals: []
            };
          });
          
          allSignals.forEach(signal => {
            // Try filed_at first, then created_at
            const dateStr = signal.filed_at || signal.created_at;
            if (!dateStr) return;
            
            const sigDate = new Date(dateStr);
            sigDate.setHours(0, 0, 0, 0);
            
            const key = sigDate.toDateString();
            if (bucketed[key]) {
              bucketed[key].signals.push(signal);
            }
          });
          
          setWeekSignals(bucketed);
          setLoading(false);
          
        } catch (e) {
          console.error('Radar fetch failed:', e);
          // Fallback: use context signals
          setLoading(false);
        }
      };
      
      buildWeek();
    }, []);

    const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const isToday = (date) => {
      const t = new Date();
      return date.toDateString() === t.toDateString();
    };

    return (
      <div style={{padding: '24px', flex: 1, overflowY: 'auto'}}>
        
        {/* Header */}
        <div style={{
          fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
          letterSpacing: '0.1em', textTransform: 'uppercase',
          marginBottom: 20
        }}>
          RADAR — THIS WEEK
        </div>
        
        {/* Day columns */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 8,
          marginBottom: 32
        }}>
          {Object.values(weekSignals).map((dayData, i) => {
            const { date, signals } = dayData;
            const today = isToday(date);
            const dayNum = date.getDate();
            
            return (
              <div key={i} style={{
                background: today ? 'var(--bg-active)' : 'var(--bg-card)',
                border: `1px solid ${today 
                  ? 'var(--accent-blue-border)' 
                  : 'var(--border-default)'}`,
                borderRadius: 8,
                padding: 12,
                minHeight: 200
              }}>
                {/* Day header */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: 10
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: today 
                      ? 'var(--accent-blue)' 
                      : 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em'
                  }}>
                    {DAY_NAMES[i]}
                  </span>
                  <span style={{
                    fontSize: 13, fontWeight: 700,
                    fontFamily: 'monospace',
                    color: today 
                      ? 'var(--text-primary)' 
                      : 'var(--text-secondary)'
                  }}>
                    {dayNum}
                  </span>
                </div>
                
                {/* Signal count badge */}
                {signals.length > 0 && (
                  <div style={{
                    fontSize: 9, fontWeight: 700,
                    padding: '2px 6px', borderRadius: 3,
                    background: 'var(--bg-hover)',
                    color: 'var(--text-secondary)',
                    marginBottom: 8, display: 'inline-block'
                  }}>
                    {signals.length} filing{signals.length !== 1 ? 's' : ''}
                  </div>
                )}
                
                {/* Signal mini-cards */}
                {signals.slice(0, 6).map((sig, j) => (
                  <div key={j} style={{
                    padding: '5px 7px',
                    marginBottom: 4,
                    borderRadius: 4,
                    background: 'var(--bg-surface)',
                    border: `1px solid var(--border-default)`,
                    borderLeft: `2px solid ${
                      sig.signal === 'Positive' 
                        ? 'var(--signal-positive)'
                        : sig.signal === 'Risk'
                          ? 'var(--signal-risk)'
                          : 'var(--border-strong)'
                    }`
                  }}>
                    <div style={{
                      display: 'flex', 
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span style={{
                        fontSize: 11, fontWeight: 800,
                        fontFamily: 'monospace',
                        color: 'var(--text-primary)'
                      }}>
                        {sig.ticker}
                      </span>
                      <span style={{
                        fontSize: 9,
                        fontFamily: 'monospace',
                        color: sig.signal === 'Positive'
                          ? 'var(--signal-positive)'
                          : sig.signal === 'Risk'
                            ? 'var(--signal-risk)'
                            : 'var(--text-muted)'
                      }}>
                        {sig.confidence}%
                      </span>
                    </div>
                    <div style={{
                      fontSize: 9, color: 'var(--text-muted)',
                      marginTop: 1, 
                      fontFamily: 'monospace'
                    }}>
                      {sig.filing_type} · {
                        sig.event_type?.replace(/_/g,' ') || ''
                      }
                    </div>
                  </div>
                ))}
                
                {signals.length > 6 && (
                  <div style={{
                    fontSize: 9, color: 'var(--text-muted)',
                    marginTop: 4, textAlign: 'center'
                  }}>
                    +{signals.length - 6} more
                  </div>
                )}
                
                {signals.length === 0 && (
                  <div style={{
                    fontSize: 10, color: 'var(--text-muted)',
                    textAlign: 'center', marginTop: 40,
                    fontStyle: 'italic'
                  }}>
                    {today ? 'Monitoring...' : 'No filings'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {/* Recent Activity section */}
        <div style={{
          fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
          letterSpacing: '0.1em', textTransform: 'uppercase',
          marginBottom: 14
        }}>
          RECENT ACTIVITY
        </div>
        
        {/* List of recent signals sorted by time */}
        {Object.values(weekSignals)
          .flatMap(d => d.signals)
          .sort((a, b) => 
            new Date(b.created_at) - new Date(a.created_at)
          )
          .slice(0, 20)
          .map((sig, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center',
              gap: 12, padding: '10px 12px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-default)',
              borderRadius: 6, marginBottom: 6
            }}>
              <span style={{
                fontSize: 13, fontWeight: 800,
                fontFamily: 'monospace',
                color: 'var(--text-primary)', minWidth: 48
              }}>
                {sig.ticker}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 700,
                padding: '1px 6px', borderRadius: 3,
                background: 'var(--bg-hover)',
                color: 'var(--text-secondary)',
                fontFamily: 'monospace'
              }}>
                {sig.filing_type}
              </span>
              <span style={{
                fontSize: 11, color: 'var(--text-secondary)',
                flex: 1
              }}>
                {sig.event_type?.replace(/_/g,' ') || sig.summary?.slice(0,60) || ''}
              </span>
              <span style={{
                fontSize: 10,
                color: sig.signal === 'Positive'
                  ? 'var(--signal-positive)'
                  : sig.signal === 'Risk'
                    ? 'var(--signal-risk)'
                    : 'var(--text-muted)',
                fontFamily: 'monospace', fontWeight: 700
              }}>
                {sig.signal}
              </span>
              <span style={{
                fontSize: 9, color: 'var(--text-muted)',
                fontFamily: 'monospace', minWidth: 70,
                textAlign: 'right'
              }}>
                {new Date(sig.created_at).toLocaleDateString()}
              </span>
            </div>
          ))
        }
      </div>
    );
  }

=============================================================
ISSUE C — GRAPH CLUSTERS DISCONNECTED, NO INTER-LINKS
=============================================================

--- C1. Diagnose the graph data ---

  # Check what /api/correlations/graph actually returns
  curl http://localhost:8001/api/correlations/graph | \
    python3 -c "
  import json, sys
  data = json.load(sys.stdin)
  nodes = data.get('nodes', [])
  links = data.get('links', [])
  print(f'Nodes: {len(nodes)}')
  print(f'Links: {len(links)}')
  
  # Check if cross-sector links exist
  if nodes:
      sectors = set(n.get('sector','') for n in nodes)
      print(f'Sectors: {sectors}')
  
  if links:
      print(f'Sample link: {links[0]}')
      # Count cross-sector links
      node_sector = {n['id']: n.get('sector','') for n in nodes}
      cross = [l for l in links 
               if node_sector.get(l.get('source','')) != 
                  node_sector.get(l.get('target',''))]
      print(f'Cross-sector links: {len(cross)}')
  "

--- C2. Fix the graph backend endpoint ---

In server.py, find GET /api/correlations/graph and replace with:

  from intelligence.correlation_engine import (
      COMPETITORS, SUPPLY_CHAIN, TICKER_SECTOR
  )

  @app.get("/api/correlations/graph")
  async def get_correlation_graph():
      """
      Returns complete graph with all nodes AND cross-sector links.
      Enriched with live signal data from Supabase.
      """
      
      # Get live signals for node coloring
      signal_map = {}
      try:
          r = await supabase_client.table("signals")\
              .select(
                  "ticker,signal,confidence,impact_score,"
                  "event_type,filing_type,created_at"
              )\
              .gte("created_at",
                   (datetime.now() - timedelta(days=7)).isoformat())\
              .order("created_at", desc=True)\
              .execute()
          
          for s in (r.data or []):
              t = s.get("ticker","").upper()
              if t and t not in signal_map:
                  signal_map[t] = s
      except Exception as e:
          logger.warning(f"Signal fetch for graph failed: {e}")
      
      # Build complete node list with sector colors
      SECTOR_COLORS = {
          "Semiconductors": "#7C3AED",
          "Big Tech":       "#0EA5E9",
          "Cloud":          "#06B6D4",
          "Pharma":         "#EF4444",
          "Fintech":        "#10B981",
          "EV/Auto":        "#F59E0B",
          "Energy":         "#F97316",
          "Banking":        "#8B5CF6",
          "Defense":        "#64748B",
          "Retail":         "#EC4899",
          "Airlines":       "#0891B2",
      }
      
      nodes = []
      seen_tickers = set()
      
      for ticker, sector in TICKER_SECTOR.items():
          if ticker in seen_tickers:
              continue
          seen_tickers.add(ticker)
          
          signal = signal_map.get(ticker)
          color = SECTOR_COLORS.get(sector, "#475569")
          
          # Override color if active signal
          if signal:
              if signal["signal"] == "Positive":
                  color = "#34D399"
              elif signal["signal"] == "Risk":
                  color = "#F87171"
          
          nodes.append({
              "id": ticker,
              "label": ticker,
              "sector": sector,
              "color": color,
              "baseColor": SECTOR_COLORS.get(sector, "#475569"),
              "val": 10 + (signal.get("impact_score", 0) // 10 
                          if signal else 0),
              "hasSignal": bool(signal),
              "signal": signal.get("signal") if signal else None,
              "confidence": signal.get("confidence") if signal else None,
              "impact_score": signal.get("impact_score") if signal else None,
              "event_type": signal.get("event_type") if signal else None,
              "filing_type": signal.get("filing_type") if signal else None,
          })
      
      # Build ALL links — competitors AND supply chain
      links = []
      seen_links = set()
      
      def add_link(source, target, link_type, value):
          key = tuple(sorted([source, target]))
          if key in seen_links:
              return
          # Only add if both nodes exist
          if source not in seen_tickers or target not in seen_tickers:
              return
          seen_links.add(key)
          links.append({
              "source": source,
              "target": target,
              "type": link_type,
              "value": value,
          })
      
      # Add competitor links
      for ticker, competitors in COMPETITORS.items():
          for comp in competitors:
              add_link(ticker, comp, "competitor", 0.6)
      
      # Add supply chain links
      for ticker, sc in SUPPLY_CHAIN.items():
          for supplier in sc.get("suppliers", []):
              add_link(ticker, supplier, "supply_chain", 0.85)
          for customer in sc.get("customers", []):
              add_link(ticker, customer, "customer", 0.7)
      
      # Add same-sector peer links (connect clusters internally)
      sector_tickers = {}
      for ticker, sector in TICKER_SECTOR.items():
          if ticker in seen_tickers:
              sector_tickers.setdefault(sector, []).append(ticker)
      
      for sector, tickers in sector_tickers.items():
          # Connect each ticker to 2 others in same sector
          for i, t in enumerate(tickers):
              for j in range(i+1, min(i+3, len(tickers))):
                  add_link(t, tickers[j], "peer", 0.4)
      
      return {
          "nodes": nodes,
          "links": links,
          "signal_map": signal_map,
          "stats": {
              "node_count": len(nodes),
              "link_count": len(links),
              "active_signals": len(signal_map),
          }
      }

--- C3. Fix Graph.jsx force simulation for proper clustering ---

In Graph.jsx, find the ForceGraph2D component and fix:

  // 1. SECTOR CLUSTER POSITIONS — spread them around the canvas
  //    NOT all in one corner
  const SECTOR_POSITIONS = {
    'Semiconductors': { x: -280, y: -180 },  // top-left
    'Big Tech':       { x:  200, y: -200 },  // top-right
    'Cloud':          { x:  80,  y: -300 },  // top-center
    'Pharma':         { x: -260, y:  160 },  // bottom-left
    'Fintech':        { x:  260, y:  180 },  // bottom-right
    'EV/Auto':        { x:  0,   y:  280 },  // bottom-center
    'Energy':         { x: -180, y:  280 },  // bottom-left-center
    'Banking':        { x:  180, y:  260 },  // bottom-right-center
    'Defense':        { x: -300, y:  0   },  // left
    'Retail':         { x:  320, y:  0   },  // right
    'Airlines':       { x:  0,   y:  160 },  // center
  };

  // 2. Apply forces when graph loads
  const handleEngineStart = useCallback(() => {
    const fg = graphRef.current;
    if (!fg) return;
    
    // Cluster force — pulls nodes toward sector center
    fg.d3Force('cluster', alpha => {
      (graphData.nodes || []).forEach(node => {
        const target = SECTOR_POSITIONS[node.sector];
        if (!target) return;
        node.vx = (node.vx || 0) + 
                  (target.x - (node.x || 0)) * 0.04 * alpha;
        node.vy = (node.vy || 0) + 
                  (target.y - (node.y || 0)) * 0.04 * alpha;
      });
    });
    
    // Strong repulsion so nodes don't overlap
    fg.d3Force('charge').strength(node => 
      node.hasSignal ? -200 : -120
    );
    
    // Link distance by type
    fg.d3Force('link').distance(link => {
      if (link.type === 'supply_chain') return 50;
      if (link.type === 'competitor')   return 60;
      if (link.type === 'customer')     return 80;
      if (link.type === 'peer')         return 45;
      return 65;
    }).strength(link => {
      if (link.type === 'supply_chain') return 0.8;
      if (link.type === 'peer')         return 0.6;
      return 0.4;  // cross-sector links are weaker
    });
    
    // Weak center force — don't collapse everything
    fg.d3Force('center').strength(0.03);
    
    // Collision force — prevent node overlap
    const d3 = window.d3 || require('d3-force');
    if (d3?.forceCollide) {
      fg.d3Force('collide', d3.forceCollide(node => 
        Math.sqrt(node.val || 8) * 2.5 + 4
      ));
    }
    
    fg.d3ReheatSimulation();
    
    // Auto fit after simulation settles
    setTimeout(() => {
      fg.zoomToFit(400, 60);
    }, 3500);
    
  }, [graphData]);

  // 3. Fix link rendering — make cross-sector links VISIBLE
  const getLinkColor = useCallback((link) => {
    const opacity = activeSector === 'ALL' ? 1 : 
      (link.source?.sector === activeSector || 
       link.target?.sector === activeSector) ? 1 : 0.05;
    
    const colors = {
      supply_chain: `rgba(124,58,237,${0.5 * opacity})`,
      competitor:   `rgba(14,165,233,${0.35 * opacity})`,
      customer:     `rgba(52,211,153,${0.3 * opacity})`,
      peer:         `rgba(71,85,105,${0.25 * opacity})`,
    };
    return colors[link.type] || `rgba(71,85,105,${0.2 * opacity})`;
  }, [activeSector]);

  const getLinkWidth = useCallback((link) => {
    const widths = {
      supply_chain: link.value * 2.5,
      competitor:   link.value * 1.5,
      customer:     link.value * 1.8,
      peer:         0.8,
    };
    return widths[link.type] || 0.8;
  }, []);

  // 4. ForceGraph2D props — MUST have these exact settings:
  <ForceGraph2D
    ref={graphRef}
    graphData={graphData}
    backgroundColor="#0F1117"
    nodeRelSize={1}
    nodeCanvasObject={nodeCanvasObject}
    nodeCanvasObjectMode={() => 'replace'}
    linkColor={getLinkColor}
    linkWidth={getLinkWidth}
    linkDirectionalParticles={link => 
      link.type === 'supply_chain' ? 2 : 0
    }
    linkDirectionalParticleSpeed={0.003}
    linkDirectionalParticleWidth={1.5}
    linkDirectionalParticleColor={() => 'rgba(124,58,237,0.8)'}
    onNodeClick={handleNodeClick}
    onEngineStop={handleEngineStop}
    cooldownTime={4000}
    d3AlphaDecay={0.015}      // slower decay = more time to settle
    d3VelocityDecay={0.25}    // less friction = wider spread
    warmupTicks={100}          // pre-run simulation before render
    onEngineStart={handleEngineStart}
    enableZoomInteraction={true}
    enablePanInteraction={true}
    minZoom={0.2}
    maxZoom={6}
  />

  // 5. Fix the data fetch in Graph.jsx useEffect:
  useEffect(() => {
    const fetchGraph = async () => {
      try {
        const r = await fetch(`${BACKEND_URL}/api/correlations/graph`);
        const data = await r.json();
        
        // IMPORTANT: react-force-graph mutates nodes in place
        // Make deep copies to prevent React state issues
        setGraphData({
          nodes: (data.nodes || []).map(n => ({...n})),
          links: (data.links || []).map(l => ({...l})),
        });
        
        setActiveSignals(data.signal_map || {});
        
      } catch (e) {
        console.error('Graph fetch failed:', e);
        // Use fallback data so graph is never blank
        setGraphData(FALLBACK_GRAPH_DATA);
      }
    };
    
    fetchGraph();
    // Refresh every 60s to pick up new signals
    const interval = setInterval(fetchGraph, 60000);
    return () => clearInterval(interval);
  }, []);

=============================================================
FINAL CHECK — run all three verifications
=============================================================

After all fixes:

1. PIPELINE CHECK:
   curl -X POST http://localhost:8001/api/edgar/backfill
   # Wait 2 minutes, then:
   curl http://localhost:8001/api/signals?limit=10 | \
     python3 -c "
   import json,sys
   d=json.load(sys.stdin)
   for s in d[:5]:
       print(f\"{s['ticker']} {s['filing_type']} conf:{s['confidence']} {s['signal']}\")
   "
   # Every signal must show conf > 0

2. RADAR CHECK:
   Open localhost:3000/dashboard → click RADAR tab
   - Current week Mon-Fri columns must show
   - THU (today) must be highlighted
   - All 41 signals distributed across their filing dates
   - Recent Activity list shows all signals below

3. GRAPH CHECK:
   Open localhost:3000/graph
   - All sectors visible, spread around canvas (not one corner)
   - Purple particles flowing along supply chain edges (NVDA→TSM etc)
   - Clicking SEMICONDUCTORS pill dims other sectors
   - Clicking NVDA node opens right panel with details
   - FIT button recenters view
   - Cross-sector links visible (thin lines connecting clusters)

Report: exact files changed, signal count before/after backfill,
and confirm graph shows cross-sector links between clusters.