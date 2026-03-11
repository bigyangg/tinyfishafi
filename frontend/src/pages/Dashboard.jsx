// Dashboard.jsx — Bloomberg Terminal x Linear professional dashboard
import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import DashboardSidebar from '../components/DashboardSidebar';
import AlertCard from '../components/AlertCard';
import SignalDetailModal from '../components/SignalDetailModal';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => { clearTimeout(timeout); func(...args); };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// === FIX 5: STATUS BAR ===
const StatusBar = ({ agentStatus, isOnline, filedToday }) => (
  <div style={{
    height: "40px",
    borderBottom: "1px solid #0d0d0d",
    display: "flex",
    alignItems: "center",
    padding: "0 16px",
    gap: "16px",
    background: "#030303",
  }}>
    {/* Agent status */}
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div style={{
        width: "5px", height: "5px",
        borderRadius: "50%",
        background: agentStatus === "running" ? "#00C805" : "#FF3333",
        animation: agentStatus === "running" ? "pulse-green 3s ease-in-out infinite" : "none",
      }} />
      <span style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: "10px",
        color: agentStatus === "running" ? "#555" : "#FF3333",
        letterSpacing: "0.08em",
      }}>
        {agentStatus === "running" ? "MONITORING SEC EDGAR" : "AGENT OFFLINE"}
      </span>
    </div>

    {/* Filings today */}
    {filedToday > 0 && (
      <span style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: "10px",
        color: "#333",
      }}>
        {filedToday} filing{filedToday !== 1 ? "s" : ""} today
      </span>
    )}

    <div style={{ flex: 1 }} />

    {/* Connection */}
    <div style={{
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: "10px",
      color: isOnline ? "#2a2a2a" : "#FF333380",
      letterSpacing: "0.06em",
    }}>
      {isOnline ? "●" : "○ DISCONNECTED"}
    </div>
  </div>
);

// === FIX 4: FEED HEADER ===
const FeedHeader = ({ filter, setFilter, count }) => (
  <div style={{
    display: "flex",
    alignItems: "center",
    padding: "0 20px",
    height: "48px",
    borderBottom: "1px solid #0d0d0d",
    gap: "0",
    flexShrink: 0,
  }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginRight: "24px" }}>
      <span style={{ fontSize: "14px", fontWeight: 600, color: "#fff" }}>
        Filings
      </span>
      <span style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: "12px",
        color: "#333",
      }}>
        {count}
      </span>
    </div>

    {["ALL", "WATCHLIST", "RISK", "OPPORTUNITY"].map(f => (
      <button
        key={f}
        onClick={() => setFilter(f)}
        style={{
          padding: "4px 12px",
          background: "none",
          border: "none",
          borderBottom: filter === f ? "1px solid #fff" : "1px solid transparent",
          color: filter === f ? "#fff" : "#333",
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: "11px",
          letterSpacing: "0.06em",
          cursor: "pointer",
          transition: "color 100ms",
          marginBottom: "-1px",
        }}
        onMouseEnter={e => filter !== f && (e.currentTarget.style.color = "#666")}
        onMouseLeave={e => filter !== f && (e.currentTarget.style.color = "#333")}
      >
        {f}
      </button>
    ))}

    <div style={{ flex: 1 }} />

    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div style={{
        width: "5px", height: "5px",
        borderRadius: "50%",
        background: "#00C805",
        animation: "pulse-green 2s ease-in-out infinite",
      }} />
      <span style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: "10px",
        color: "#333",
      }}>
        LIVE
      </span>
    </div>
  </div>
);

// === FIX 3: RIGHT PANEL ZONES ===

const TodayStats = ({ signals }) => {
  const risks = signals.filter(s => s.classification === "Risk").length;
  const opps = signals.filter(s => s.classification === "Positive").length;
  const total = signals.length;

  return (
    <div style={{ padding: "16px", borderBottom: "1px solid #0f0f0f" }}>
      <div style={{
        fontSize: "10px",
        fontFamily: "'IBM Plex Mono', monospace",
        color: "#333",
        letterSpacing: "0.1em",
        marginBottom: "12px",
      }}>
        TODAY
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
        {[
          { value: total, label: "Filings", color: "#555" },
          { value: opps, label: "Opportunities", color: opps > 0 ? "#00C805" : "#333" },
          { value: risks, label: "Risks", color: risks > 0 ? "#FF3333" : "#333" },
        ].map(({ value, label, color }) => (
          <div key={label} style={{
            background: "#080808",
            border: "1px solid #111",
            padding: "10px 8px",
            textAlign: "center",
          }}>
            <div style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontWeight: 700,
              fontSize: "20px",
              color,
              lineHeight: 1,
              marginBottom: "4px",
            }}>
              {value}
            </div>
            <div style={{
              fontSize: "9px",
              color: "#333",
              fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}>
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const SignalSummary = ({ brief, isGenerating, briefAge }) => {
  const bullets = brief
    ? brief
      .split(/(?<=[.!?])\s+/)
      .filter(s => s.length > 20)
      .slice(0, 3)
      .map(s => s.trim().replace(/\.$/, ""))
    : [];

  return (
    <div style={{ padding: "16px", borderBottom: "1px solid #0f0f0f" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "12px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{
            width: "5px", height: "5px",
            borderRadius: "50%",
            background: isGenerating ? "#FFB300" : "#0066FF",
            animation: isGenerating ? "pulse 1s ease infinite" : "none",
          }} />
          <span style={{
            fontSize: "10px",
            fontFamily: "'IBM Plex Mono', monospace",
            color: "#444",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}>
            Signal Summary
          </span>
        </div>
        {briefAge > 0 && (
          <span style={{
            fontSize: "10px",
            fontFamily: "'IBM Plex Mono', monospace",
            color: "#222",
          }}>
            {briefAge < 60 ? `${briefAge}s ago` : `${Math.floor(briefAge / 60)}m ago`}
          </span>
        )}
      </div>

      {isGenerating ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[90, 75, 55].map((w, i) => (
            <div key={i} style={{
              height: "8px",
              width: `${w}%`,
              background: "#111",
              animation: `shimmer 1.5s ease ${i * 0.2}s infinite`,
            }} />
          ))}
        </div>
      ) : bullets.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          {bullets.map((bullet, i) => (
            <div key={i} style={{
              display: "flex",
              gap: "10px",
              padding: "8px 0",
              borderBottom: i < bullets.length - 1 ? "1px solid #0d0d0d" : "none",
              alignItems: "flex-start",
            }}>
              <div style={{
                width: "4px",
                height: "4px",
                borderRadius: "50%",
                background: i === 0 ? "#0066FF" : "#222",
                marginTop: "6px",
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: "12px",
                color: i === 0 ? "#888" : "#444",
                lineHeight: 1.55,
                fontWeight: i === 0 ? 500 : 400,
              }}>
                {bullet}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{
          fontSize: "12px",
          color: "#222",
          margin: 0,
          fontFamily: "'IBM Plex Mono', monospace",
          fontStyle: "italic",
        }}>
          Awaiting new filings...
        </p>
      )}
    </div>
  );
};

const WatchlistZone = ({ watchlist, signals, onAdd, onRemove }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const watchedWithSignals = watchlist.map(ticker => {
    const latest = signals.find(s => s.ticker === ticker);
    return { ticker, signal: latest?.classification || null, summary: latest?.summary || null };
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const search = useCallback(
    debounce(async (q) => {
      if (!q.trim()) { setResults([]); return; }
      setSearching(true);
      try {
        const resp = await fetch(`${API}/ticker/search?q=${encodeURIComponent(q)}`);
        const data = await resp.json();
        setResults(data.results || [{ ticker: q.toUpperCase(), name: q.toUpperCase() }]);
      } catch {
        setResults([{ ticker: q.toUpperCase(), name: q.toUpperCase() }]);
      } finally {
        setSearching(false);
      }
    }, 300),
    []
  );

  return (
    <div style={{ padding: "16px", flex: 1 }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "10px",
      }}>
        <span style={{
          fontSize: "10px",
          fontFamily: "'IBM Plex Mono', monospace",
          color: "#333",
          letterSpacing: "0.1em",
        }}>
          WATCHLIST
        </span>
        <span style={{
          fontSize: "10px",
          fontFamily: "'IBM Plex Mono', monospace",
          color: "#222",
        }}>
          {watchlist.length}/10
        </span>
      </div>

      <div style={{ position: "relative", marginBottom: "8px" }}>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); search(e.target.value); }}
          onKeyDown={e => {
            if (e.key === "Enter" && query.trim()) {
              onAdd(query.trim().toUpperCase());
              setQuery("");
              setResults([]);
            }
          }}
          placeholder="+ Add ticker"
          style={{
            width: "100%",
            background: "#080808",
            border: "1px solid #1a1a1a",
            color: "#fff",
            padding: "7px 10px",
            fontSize: "12px",
            fontFamily: "'IBM Plex Mono', monospace",
            outline: "none",
            boxSizing: "border-box",
          }}
          onFocus={e => e.target.style.borderColor = "#2a2a2a"}
          onBlur={e => { e.target.style.borderColor = "#1a1a1a"; }}
        />
        {searching && (
          <span style={{
            position: "absolute", right: "8px", top: "50%",
            transform: "translateY(-50%)",
            fontSize: "10px", color: "#333", fontFamily: "monospace",
          }}>···</span>
        )}
      </div>

      {results.length > 0 && (
        <div style={{ border: "1px solid #111", marginBottom: "8px", background: "#080808" }}>
          {results.slice(0, 5).map((r, i) => {
            const alreadyAdded = watchlist.includes(r.ticker);
            return (
              <button
                key={`${r.ticker}-${i}`}
                onClick={() => { if (!alreadyAdded) { onAdd(r.ticker); setQuery(""); setResults([]); } }}
                disabled={alreadyAdded}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 10px",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid #0d0d0d",
                  cursor: alreadyAdded ? "default" : "pointer",
                  color: alreadyAdded ? "#2a2a2a" : "#888",
                  transition: "background 80ms",
                }}
                onMouseEnter={e => !alreadyAdded && (e.currentTarget.style.background = "#0f0f0f")}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <span style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontWeight: 700,
                    fontSize: "12px",
                    color: alreadyAdded ? "#2a2a2a" : "#ddd",
                  }}>
                    {r.ticker}
                  </span>
                  <span style={{ fontSize: "11px", color: "#333" }}>
                    {(r.name || "").slice(0, 20)}{r.name?.length > 20 ? "…" : ""}
                  </span>
                </div>
                <span style={{ fontSize: "12px", color: alreadyAdded ? "#1a1a1a" : "#333" }}>
                  {alreadyAdded ? "✓" : "+"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {watchedWithSignals.length === 0 ? (
        <div style={{ padding: "20px 0", textAlign: "center" }}>
          <p style={{
            fontSize: "11px",
            color: "#1e1e1e",
            fontFamily: "'IBM Plex Mono', monospace",
            margin: 0,
            letterSpacing: "0.06em",
          }}>
            NO TICKERS WATCHED
          </p>
          <p style={{ fontSize: "11px", color: "#1a1a1a", margin: "6px 0 0" }}>
            Type a ticker above to start
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {watchedWithSignals.map(({ ticker, signal }) => {
            const sigColor = signal === "Positive" ? "#00C805"
              : signal === "Risk" ? "#FF3333"
                : "#1e1e1e";

            return (
              <div key={ticker} style={{
                display: "flex",
                alignItems: "center",
                padding: "8px 0",
                borderBottom: "1px solid #0d0d0d",
                gap: "8px",
              }}>
                <div style={{
                  width: "5px", height: "5px",
                  borderRadius: "50%",
                  background: sigColor,
                  flexShrink: 0,
                }} />

                <span style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontWeight: 600,
                  fontSize: "12px",
                  color: "#ccc",
                  flex: 1,
                }}>
                  {ticker}
                </span>

                {signal && signal !== "Neutral" && signal !== "Pending" && (
                  <span style={{
                    fontSize: "9px",
                    color: sigColor,
                    fontFamily: "'IBM Plex Mono', monospace",
                    letterSpacing: "0.06em",
                  }}>
                    {signal === "Positive" ? "OPP" : "RISK"}
                  </span>
                )}

                <button
                  onClick={() => onRemove(ticker)}
                  style={{
                    background: "none", border: "none",
                    color: "#1e1e1e", cursor: "pointer",
                    fontSize: "14px", lineHeight: 1, padding: "0 2px",
                    transition: "color 150ms",
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = "#FF3333"}
                  onMouseLeave={e => e.currentTarget.style.color = "#1e1e1e"}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};


// === MAIN COMPONENT ===

export default function Dashboard() {
  const { user, authHeaders, logout } = useAuth();
  const [allSignals, setAllSignals] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedFilter, setFeedFilter] = useState('ALL');
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [newSignalIds, setNewSignalIds] = useState(new Set());

  // Health check — debounced
  const [backendOnline, setBackendOnline] = useState(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const offlineTimerRef = useRef(null);

  // Agent status
  const [agentStatus, setAgentStatus] = useState({
    agent_status: 'not_initialized',
    last_poll_time: null,
    filings_processed_today: 0,
    next_poll_seconds: null,
    poll_interval: 120,
  });

  // AI Brief
  const [brief, setBrief] = useState('');
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefTimestamp, setBriefTimestamp] = useState(null);
  const [briefAge, setBriefAge] = useState(0);

  // Format row
  const formatSignalRow = useCallback((row) => ({
    id: row.id || '',
    ticker: row.ticker || '',
    filing_type: row.filing_type || '8-K',
    classification: row.signal || 'Pending',
    company_name: row.company || '',
    summary: row.summary || '',
    confidence: row.confidence || 0,
    filed_at: row.filed_at || '',
    accession_number: row.accession_number || '',
    edgar_url: row.edgar_url || '',
    event_type: row.event_type || null,
    impact_score: row.impact_score || null,
  }), []);

  // Check health
  const checkHealth = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${API}/health`, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        if (offlineTimerRef.current) {
          clearTimeout(offlineTimerRef.current);
          offlineTimerRef.current = null;
        }
        setBackendOnline(true);
        setConsecutiveFailures(0);
      }
    } catch {
      setConsecutiveFailures(prev => prev + 1);
      if (!offlineTimerRef.current) {
        offlineTimerRef.current = setTimeout(() => {
          setBackendOnline(false);
          offlineTimerRef.current = null;
        }, 15000);
      }
    }
  }, []);

  // Fetch logic
  const fetchData = useCallback(async () => {
    try {
      const [sigRes, wlRes] = await Promise.all([
        axios.get(`${API}/signals`, { headers: authHeaders() }),
        axios.get(`${API}/watchlist`, { headers: authHeaders() }),
      ]);
      setAllSignals(sigRes.data.signals || []);
      setWatchlist(wlRes.data.tickers || []);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  const fetchAgentStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/edgar/status`);
      setAgentStatus(res.data);
    } catch {
      // silent
    }
  }, []);

  const fetchBrief = useCallback(async () => {
    setBriefLoading(true);
    try {
      const res = await axios.get(`${API}/brief`);
      setBrief(res.data.brief || '');
      setBriefTimestamp(new Date());
      setBriefAge(0);
    } catch {
      setBrief('Unable to load market brief.');
    } finally {
      setBriefLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (!user) return;
    fetchData();
    fetchBrief();
    checkHealth();
    fetchAgentStatus();
  }, [user, fetchData, fetchBrief, checkHealth, fetchAgentStatus]);

  // Polling intervals
  useEffect(() => {
    const healthInterval = setInterval(checkHealth, 5000);
    const agentInterval = setInterval(fetchAgentStatus, 15000);
    const signalInterval = setInterval(fetchData, 30000);
    const briefInterval = setInterval(fetchBrief, 120000);

    return () => {
      clearInterval(healthInterval);
      clearInterval(agentInterval);
      clearInterval(signalInterval);
      clearInterval(briefInterval);
      if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current);
    };
  }, [checkHealth, fetchAgentStatus, fetchData, fetchBrief]);

  // Realtime Subscriptions
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('signals-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'signals' },
        (payload) => {
          const formatted = formatSignalRow(payload.new);
          setAllSignals(prev => [formatted, ...prev]);
          setNewSignalIds(prev => new Set([...prev, formatted.id]));
          setTimeout(() => {
            setNewSignalIds(prev => {
              const next = new Set(prev);
              next.delete(formatted.id);
              return next;
            });
          }, 3000);
          fetchBrief();
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user, formatSignalRow, fetchBrief]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('watchlist-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'watchlist' },
        () => {
          axios.get(`${API}/watchlist`, { headers: authHeaders() })
            .then(res => setWatchlist(res.data.tickers || []))
            .catch(() => { });
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user, authHeaders]);

  // Brief age counter
  useEffect(() => {
    if (!briefTimestamp) return;
    const timer = setInterval(() => {
      setBriefAge(Math.floor((Date.now() - briefTimestamp.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [briefTimestamp]);

  // Watchlist actions
  const addTicker = async (ticker) => {
    try {
      const res = await axios.post(`${API}/watchlist`, { ticker }, { headers: authHeaders() });
      setWatchlist(res.data.tickers);
    } catch (err) {
      return err.response?.data?.detail || 'Failed to add';
    }
  };

  const removeTicker = async (ticker) => {
    try {
      const res = await axios.delete(`${API}/watchlist/${ticker}`, { headers: authHeaders() });
      setWatchlist(res.data.tickers);
    } catch (err) {
      console.error('Failed to remove ticker:', err);
    }
  };

  const toggleWatch = async (ticker) => {
    if (watchlist.includes(ticker)) await removeTicker(ticker);
    else await addTicker(ticker);
  };

  // Filter signals based on feedFilter: "ALL", "WATCHLIST", "RISK", "OPPORTUNITY"
  let displayedSignals = allSignals;
  if (feedFilter === 'WATCHLIST' && watchlist.length > 0) {
    displayedSignals = displayedSignals.filter(s => watchlist.includes(s.ticker));
  } else if (feedFilter === 'RISK') {
    displayedSignals = displayedSignals.filter(s => s.classification === 'Risk');
  } else if (feedFilter === 'OPPORTUNITY') {
    displayedSignals = displayedSignals.filter(s => s.classification === 'Positive');
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "160px 1fr 280px",
      gridTemplateRows: "40px 1fr",
      height: "100vh",
      overflow: "hidden",
      background: "#030303",
    }}>

      {/* TOP STATUS BAR */}
      <div style={{ gridColumn: "1 / -1", gridRow: "1", zIndex: 10 }}>
        <StatusBar
          agentStatus={agentStatus.agent_status}
          isOnline={backendOnline !== false || consecutiveFailures < 3}
          filedToday={agentStatus.filings_processed_today}
        />
      </div>

      {/* LEFT NAV */}
      <div style={{ gridRow: "2", borderRight: "1px solid #0d0d0d", overflow: "hidden" }}>
        <DashboardSidebar user={user} onLogout={logout} />
      </div>

      {/* CENTER FEED */}
      <div style={{ gridRow: "2", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <FeedHeader filter={feedFilter} setFilter={setFeedFilter} count={displayedSignals.length} />

        <div style={{ flex: 1, overflowY: "auto", padding: "0" }} data-testid="signals-feed">
          {loading ? (
            <div style={{ padding: "40px 20px", textAlign: "center" }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#333", animation: "pulse 2s ease infinite" }}>
                LOADING SIGNALS...
              </div>
            </div>
          ) : displayedSignals.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center" }}>
              {allSignals.length === 0 ? (
                <>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#2a2a2a", marginBottom: "16px", letterSpacing: "0.08em" }}>
                    NO SIGNALS YET
                  </div>
                  <p style={{ fontSize: "12px", color: "#222", marginBottom: "16px" }}>
                    Agent is monitoring EDGAR. First signals will appear shortly.
                  </p>
                </>
              ) : (
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#2a2a2a", letterSpacing: "0.08em" }}>
                  NO SIGNALS MATCH FILTER
                </div>
              )}
            </div>
          ) : (
            displayedSignals.map(signal => (
              <AlertCard
                key={signal.id}
                signal={signal}
                onClick={setSelectedSignal}
                isNew={newSignalIds.has(signal.id)}
                isWatched={watchlist.includes(signal.ticker)}
                onToggleWatch={toggleWatch}
              />
            ))
          )}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div style={{
        gridRow: "2",
        borderLeft: "1px solid #0d0d0d",
        display: "flex",
        flexDirection: "column",
        background: "#030303",
        overflowY: "auto",
      }}>
        <TodayStats signals={allSignals} />
        <SignalSummary brief={brief} isGenerating={briefLoading} briefAge={briefAge} />
        <WatchlistZone watchlist={watchlist} signals={allSignals} onAdd={addTicker} onRemove={removeTicker} />
      </div>

      {/* MODAL */}
      {selectedSignal && (
        <SignalDetailModal
          signal={selectedSignal}
          onClose={() => setSelectedSignal(null)}
        />
      )}
    </div>
  );
}
