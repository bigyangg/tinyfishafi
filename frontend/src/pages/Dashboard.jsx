// Dashboard.jsx — Bloomberg Terminal x Linear professional dashboard
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import DashboardSidebar from '../components/DashboardSidebar';
import AlertCard from '../components/AlertCard';
import SignalDetailModal from '../components/SignalDetailModal';
import { SignalSkeleton, StatsSkeleton, WatchlistSkeleton } from '../components/SignalSkeleton';
import { usePushNotifications } from '../hooks/usePushNotifications';

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
const FeedHeader = ({ filter, setFilter, count, tabCounts }) => (
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
          padding: "10px 14px",
          background: "transparent",
          border: "none",
          borderBottom: filter === f ? "1px solid #fff" : "1px solid transparent",
          marginBottom: "-1px",
          color: filter === f ? "#fff" : "#2a2a2a",
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: "11px",
          letterSpacing: "0.08em",
          cursor: "pointer",
          transition: "color 100ms",
        }}
        onMouseEnter={e => filter !== f && (e.currentTarget.style.color = "#666")}
        onMouseLeave={e => filter !== f && (e.currentTarget.style.color = "#2a2a2a")}
      >
        {f}
        {tabCounts && tabCounts[f] !== undefined && tabCounts[f] > 0 && (
          <span style={{ marginLeft: "5px", color: filter === f ? "#555" : "#1e1e1e" }}>
            {tabCounts[f]}
          </span>
        )}
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

const EVENT_META = {
  EARNINGS_BEAT: { label: "Earnings Beat", color: "#00C805" },
  EARNINGS_MISS: { label: "Earnings Miss", color: "#FF3333" },
  EXEC_DEPARTURE: { label: "Exec Change", color: "#FF6B00" },
  EXEC_APPOINTMENT: { label: "New Leadership", color: "#00C805" },
  MERGER_ACQUISITION: { label: "M&A", color: "#0066FF" },
  LEGAL_REGULATORY: { label: "Legal/Reg", color: "#FF3333" },
  DEBT_FINANCING: { label: "Financing", color: "#666" },
  MATERIAL_EVENT: { label: "Material Event", color: "#FF6B00" },
  DIVIDEND: { label: "Dividend", color: "#00C805" },
  ROUTINE_ADMIN: { label: "Admin 8-K", color: "#252525" },
};

const TodayStats = ({ signals }) => {
  const stats = useMemo(() => ({
    total: signals.length,
    positive: signals.filter(s => s.classification === "Positive").length,
    risks: signals.filter(s => s.classification === "Risk").length,
  }), [signals]);

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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1px", background: "#0d0d0d", marginBottom: "16px" }}>
        {[
          { label: "FILINGS", value: stats.total, color: "#fff" },
          { label: "POSITIVE", value: stats.positive, color: stats.positive > 0 ? "#00C805" : "#333" },
          { label: "RISK", value: stats.risks, color: stats.risks > 0 ? "#FF3333" : "#333" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "#080808", padding: "10px 12px" }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "20px", fontWeight: 700, color, lineHeight: 1 }}>
              {value}
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "9px", color: "#2a2a2a", letterSpacing: "0.1em", marginTop: "4px" }}>
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const TopSignals = ({ signals, watchlist = [] }) => {
  const topSignals = useMemo(() => {
    // Watchlist signals first (always show regardless of score)
    const watchlistSignals = signals
      .filter(s => watchlist.includes(s.ticker))
      .sort((a, b) => (b.impact_score || 0) - (a.impact_score || 0));

    // Then top non-watchlist signals by impact
    const watchlistTickers = new Set(watchlistSignals.map(s => s.ticker));
    const otherSignals = signals
      .filter(s => !watchlistTickers.has(s.ticker) && (s.classification !== "Neutral" || (s.impact_score || 0) >= 55))
      .sort((a, b) => (b.impact_score || 0) - (a.impact_score || 0));

    // Combine: all watchlist + fill up to 5 with others
    return [...watchlistSignals, ...otherSignals].slice(0, 5);
  }, [signals, watchlist]);

  return (
    <div style={{ padding: "16px", borderBottom: "1px solid #0f0f0f" }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "9px", color: "#333", letterSpacing: "0.1em", marginBottom: "8px" }}>
        TOP SIGNALS
      </div>
      {topSignals.length === 0 ? (
        <p style={{ fontSize: "11px", color: "#1a1a1a", fontFamily: "'IBM Plex Mono', monospace", margin: 0 }}>
          No notable signals yet
        </p>
      ) : topSignals.map(s => (
        <div key={s.id} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "6px 0", borderBottom: "1px solid #0d0d0d",
        }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {watchlist.includes(s.ticker) && (
              <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#0066FF", flexShrink: 0 }} />
            )}
            <span style={{
              fontFamily: "'IBM Plex Mono', monospace", fontSize: "12px", fontWeight: 700,
              color: s.classification === "Positive" ? "#00C805" : s.classification === "Risk" ? "#FF3333" : "#aaa",
            }}>
              {s.ticker}
            </span>
            <span style={{ fontSize: "10px", color: "#2a2a2a", fontFamily: "'IBM Plex Mono', monospace" }}>
              {(EVENT_META[s.event_type] || { label: "8-K" }).label}
            </span>
          </div>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#333" }}>
            {s.impact_score || 0}
          </span>
        </div>
      ))}
    </div>
  );
};

const MarketBrief = ({ brief, isGenerating, briefAge }) => {
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
            Market Brief
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

      {isGenerating && (
        <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
          {[100, 80, 55].map((w, i) => (
            <div key={i} style={{
              height: "8px", width: `${w}%`, background: "#111",
              animation: `shimmer 1.5s ${i * 0.15}s ease infinite`,
            }} />
          ))}
        </div>
      )}

      {/* Brief content — split into sentences: */}
      {!isGenerating && brief && (
        <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
          {brief.split(/(?<=[.!?])\s+/).slice(0, 3).map((sentence, i) => (
            <p key={i} style={{
              margin: 0,
              fontSize: i === 0 ? "12px" : "11px",
              color: i === 0 ? "#777" : "#333",
              lineHeight: 1.6,
              borderLeft: i === 0 ? "2px solid #0066FF35" : "none",
              paddingLeft: i === 0 ? "8px" : "0",
            }}>
              {sentence}
            </p>
          ))}
        </div>
      )}

      {!isGenerating && !brief && (
        <p style={{ fontSize: "11px", color: "#1a1a1a", margin: 0, fontFamily: "'IBM Plex Mono', monospace" }}>
          Awaiting signals...
        </p>
      )}
    </div>
  );
};

const WatchlistZone = ({ watchlist, signals, onAdd, onRemove }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const inputRef = useRef(null);

  const watchedWithSignals = watchlist.map(ticker => {
    const latest = signals.find(s => s.ticker === ticker);
    return { ticker, signal: latest?.classification || null, summary: latest?.summary || null, impactScore: latest?.impact_score || null };
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const search = useCallback(
    debounce(async (q) => {
      if (!q.trim()) { setResults([]); return; }
      setIsSearching(true);
      try {
        const resp = await fetch(`${API}/ticker/search?q=${encodeURIComponent(q)}`);
        const data = await resp.json();
        setResults(data.results || [{ ticker: q.toUpperCase(), name: q.toUpperCase() }]);
      } catch {
        setResults([{ ticker: q.toUpperCase(), name: q.toUpperCase() }]);
      } finally {
        setIsSearching(false);
      }
    }, 300),
    []
  );

  const handleAdd = (ticker) => {
    onAdd(ticker);
    setIsAdding(false);
    setQuery("");
    setResults([]);
  };

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
        {!isAdding ? (
          <button
            onClick={() => { setIsAdding(true); setTimeout(() => inputRef.current?.focus(), 30); }}
            style={{
              width: "100%", padding: "8px", background: "transparent",
              border: "1px dashed #1e1e1e", color: "#333",
              fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", letterSpacing: "0.08em",
              cursor: "pointer", transition: "all 150ms",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#333"; e.currentTarget.style.color = "#888"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#1e1e1e"; e.currentTarget.style.color = "#333"; }}
          >
            + ADD TICKER
          </button>
        ) : (
          <div>
            <input
              ref={inputRef}
              value={query}
              onChange={e => { setQuery(e.target.value); search(e.target.value); }}
              onKeyDown={e => {
                if (e.key === "Escape") { setIsAdding(false); setQuery(""); setResults([]); }
                if (e.key === "Enter" && query.trim()) handleAdd(query.trim().toUpperCase());
              }}
              placeholder="AAPL, NVDA, TSLA..."
              style={{
                width: "100%", background: "#0d0d0d", border: "1px solid #333",
                borderBottom: results.length > 0 ? "1px solid #1a1a1a" : "1px solid #333",
                color: "#fff", padding: "8px 10px",
                fontFamily: "'IBM Plex Mono', monospace", fontSize: "12px",
                outline: "none", boxSizing: "border-box",
              }}
              onBlur={() => { setTimeout(() => { if (!query) setIsAdding(false); }, 200); }}
            />
            {isSearching && (
              <span style={{
                position: "absolute", right: "8px", top: "12px",
                fontSize: "10px", color: "#333", fontFamily: "monospace",
              }}>···</span>
            )}
            {results.length > 0 && (
              <div style={{ border: "1px solid #1a1a1a", borderTop: "none" }}>
                {results.slice(0, 5).map((r, i) => {
                  const alreadyAdded = watchlist.includes(r.ticker);
                  return (
                    <button
                      key={`${r.ticker}-${i}`}
                      onClick={() => { if (!alreadyAdded) handleAdd(r.ticker); }}
                      disabled={alreadyAdded}
                      style={{
                        width: "100%", display: "flex", justifyContent: "space-between",
                        padding: "7px 10px", background: "#0a0a0a", border: "none",
                        borderBottom: i < Math.min(results.length, 5) - 1 ? "1px solid #0d0d0d" : "none",
                        cursor: alreadyAdded ? "default" : "pointer",
                      }}
                      onMouseEnter={e => !alreadyAdded && (e.currentTarget.style.background = "#111")}
                      onMouseLeave={e => e.currentTarget.style.background = "#0a0a0a"}
                    >
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "12px", fontWeight: 600, color: alreadyAdded ? "#222" : "#ccc" }}>
                        {r.ticker}
                      </span>
                      <span style={{ fontSize: "11px", color: "#2a2a2a", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

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
          {watchedWithSignals.map(({ ticker, signal, impactScore }) => {
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

                {(impactScore || 0) > 0 && (
                  <span style={{
                    fontSize: "10px",
                    color: "#2a2a2a",
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}>
                    {impactScore}
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


// === CACHE HELPERS ===
const SIGNAL_CACHE_KEY = "afi_signals_cache";
const SIGNAL_CACHE_TTL = 90 * 1000;
const BRIEF_CACHE_KEY = "afi_brief_cache";
const BRIEF_TTL = 5 * 60 * 1000;
const WATCHLIST_CACHE_KEY = "afi_watchlist";

const loadCache = (key, ttl) => {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > ttl) return null;
    return data;
  } catch { return null; }
};
const saveCache = (key, data) => {
  try { sessionStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() })); } catch { }
};
const loadWatchlistCache = () => {
  try { return JSON.parse(localStorage.getItem(WATCHLIST_CACHE_KEY)) || []; } catch { return []; }
};
const saveWatchlistCache = (tickers) => {
  try { localStorage.setItem(WATCHLIST_CACHE_KEY, JSON.stringify(tickers)); } catch { }
};

// === MAIN COMPONENT ===

export default function Dashboard() {
  const { user, authHeaders, logout } = useAuth();
  // FIX 3 & 9: Init from cache instantly
  const [allSignals, setAllSignals] = useState(() => loadCache(SIGNAL_CACHE_KEY, SIGNAL_CACHE_TTL) || []);
  const [watchlist, setWatchlist] = useState(() => loadWatchlistCache());
  const [signalsLoading, setSignalsLoading] = useState(() => !loadCache(SIGNAL_CACHE_KEY, SIGNAL_CACHE_TTL));
  const [watchlistLoading, setWatchlistLoading] = useState(() => loadWatchlistCache().length === 0);
  const [feedFilter, setFeedFilter] = useState('ALL');
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [newSignalIds, setNewSignalIds] = useState(new Set());

  // Browser push notifications
  const { requestPermission, notifyNewSignal } = usePushNotifications();
  const [showNotifPrompt, setShowNotifPrompt] = useState(
    typeof Notification !== "undefined" && Notification.permission === "default"
  );

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
  const [brief, setBrief] = useState(() => {
    const cached = loadCache(BRIEF_CACHE_KEY, BRIEF_TTL);
    return cached || '';
  });
  const [briefLoading, setBriefLoading] = useState(() => !loadCache(BRIEF_CACHE_KEY, BRIEF_TTL));
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
        if (offlineTimerRef.current) { clearTimeout(offlineTimerRef.current); offlineTimerRef.current = null; }
        setBackendOnline(true);
        setConsecutiveFailures(0);
      }
    } catch {
      setConsecutiveFailures(prev => prev + 1);
      if (!offlineTimerRef.current) {
        offlineTimerRef.current = setTimeout(() => { setBackendOnline(false); offlineTimerRef.current = null; }, 15000);
      }
    }
  }, []);

  const fetchAgentStatus = useCallback(async () => {
    try { const res = await axios.get(`${API}/edgar/status`); setAgentStatus(res.data); } catch { }
  }, []);

  // FIX 4: Brief with cache
  const fetchBrief = useCallback(async (force = false) => {
    if (!force) {
      const cached = loadCache(BRIEF_CACHE_KEY, BRIEF_TTL);
      if (cached) { setBrief(cached); return; }
    }
    setBriefLoading(true);
    try {
      const res = await axios.get(`${API}/brief`);
      const text = res.data.brief || '';
      setBrief(text);
      saveCache(BRIEF_CACHE_KEY, text);
      setBriefTimestamp(new Date());
      setBriefAge(0);
    } catch { setBrief('Unable to load market brief.'); }
    finally { setBriefLoading(false); }
  }, []);

  // FIX 1: Parallel initial load with FIX 3 + 9 caching
  useEffect(() => {
    if (!user) return;

    const load = async () => {
      // Fire everything in parallel
      const [sigResult, wlResult, healthResult] = await Promise.allSettled([
        axios.get(`${API}/signals?limit=50`, { headers: authHeaders() }),
        axios.get(`${API}/watchlist`, { headers: authHeaders() }),
        (async () => { await checkHealth(); await fetchAgentStatus(); })(),
      ]);

      if (sigResult.status === "fulfilled") {
        const signals = sigResult.value.data.signals || [];
        setAllSignals(signals);
        saveCache(SIGNAL_CACHE_KEY, signals);
      }
      setSignalsLoading(false);

      if (wlResult.status === "fulfilled") {
        const tickers = wlResult.value.data.tickers || [];
        setWatchlist(tickers);
        saveWatchlistCache(tickers);
      }
      setWatchlistLoading(false);

      // Brief loads after (needs signals context), non-blocking
      fetchBrief();
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Polling intervals — reduced frequency
  useEffect(() => {
    const healthInterval = setInterval(checkHealth, 30000);
    const agentInterval = setInterval(fetchAgentStatus, 20000);
    // Signals poll less aggressively since we have realtime
    const signalInterval = setInterval(async () => {
      try {
        const res = await axios.get(`${API}/signals?limit=50`, { headers: authHeaders() });
        const signals = res.data.signals || [];
        setAllSignals(signals);
        saveCache(SIGNAL_CACHE_KEY, signals);
      } catch { }
    }, 45000);

    return () => {
      clearInterval(healthInterval);
      clearInterval(agentInterval);
      clearInterval(signalInterval);
      if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FIX 6: Realtime — stable deps, filter junk before adding
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('signals-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'signals' },
        (payload) => {
          const row = payload.new;
          // FIX 5: Don't render pending/junk in feed
          if (!row.summary || row.signal === 'Pending') return;
          if (!row.ticker || row.ticker === 'UNKNOWN') return;

          const formatted = formatSignalRow(row);
          setAllSignals(prev => {
            const updated = [formatted, ...prev];
            saveCache(SIGNAL_CACHE_KEY, updated);
            return updated;
          });
          setNewSignalIds(prev => new Set([...prev, formatted.id]));
          setTimeout(() => {
            setNewSignalIds(prev => { const next = new Set(prev); next.delete(formatted.id); return next; });
          }, 3000);
          // Invalidate brief cache so next fetch is fresh
          sessionStorage.removeItem(BRIEF_CACHE_KEY);
          fetchBrief(true);
          // Browser push notification (only when tab is not active)
          notifyNewSignal(formatted);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('watchlist-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'watchlist' },
        () => {
          axios.get(`${API}/watchlist`, { headers: authHeaders() })
            .then(res => {
              const tickers = res.data.tickers || [];
              setWatchlist(tickers);
              saveWatchlistCache(tickers);
            })
            .catch(() => { });
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Brief age counter
  useEffect(() => {
    if (!briefTimestamp) return;
    const timer = setInterval(() => {
      setBriefAge(Math.floor((Date.now() - briefTimestamp.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [briefTimestamp]);

  // FIX 9: Optimistic watchlist with localStorage
  const addTicker = async (ticker) => {
    const prev = watchlist;
    const updated = [...watchlist, ticker.toUpperCase()];
    setWatchlist(updated);
    saveWatchlistCache(updated);
    try {
      const res = await axios.post(`${API}/watchlist`, { ticker }, { headers: authHeaders() });
      setWatchlist(res.data.tickers);
      saveWatchlistCache(res.data.tickers);
      // Auto-trigger manual fetch so the feed gets the ticker's latest filing immediately
      axios.post(`${API}/edgar/fetch-company`, { ticker: ticker.toUpperCase() }).catch(() => { });
    } catch (err) {
      setWatchlist(prev);
      saveWatchlistCache(prev);
      return err.response?.data?.detail || 'Failed to add';
    }
  };

  const removeTicker = async (ticker) => {
    const prev = watchlist;
    const updated = watchlist.filter(t => t !== ticker);
    setWatchlist(updated);
    saveWatchlistCache(updated);
    try {
      const res = await axios.delete(`${API}/watchlist/${ticker}`, { headers: authHeaders() });
      setWatchlist(res.data.tickers);
      saveWatchlistCache(res.data.tickers);
    } catch (err) {
      setWatchlist(prev);
      saveWatchlistCache(prev);
    }
  };

  const toggleWatch = async (ticker) => {
    if (watchlist.includes(ticker)) await removeTicker(ticker);
    else await addTicker(ticker);
  };

  // FIX 5: Enhanced junk filter — removes ghost cards, pending, and analyzing states
  const JUNK_PHRASES = [
    "no matching ticker", "not an 8-k", "provided text", "unable to provide",
    "system message", "cannot analyze", "without its full text content",
    "agent is analyzing", "processing filing", "pending ai classification",
  ];

  const cleanSignals = useMemo(() => {
    return allSignals.filter(s => {
      if (!s.ticker || s.ticker === "UNKNOWN") return false;
      if (!s.summary) return false;
      if (s.confidence === 0 && s.classification === "Pending") return false;
      const lower = s.summary.toLowerCase();
      if (JUNK_PHRASES.some(p => lower.includes(p))) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSignals]);

  const filteredSignals = useMemo(() => {
    switch (feedFilter) {
      case "WATCHLIST": return cleanSignals.filter(s => watchlist.includes(s.ticker));
      case "RISK": return cleanSignals.filter(s => s.classification === "Risk");
      case "OPPORTUNITY": return cleanSignals.filter(s => s.classification === "Positive");
      default: return cleanSignals;
    }
  }, [cleanSignals, watchlist, feedFilter]);

  const tabCounts = useMemo(() => ({
    WATCHLIST: cleanSignals.filter(s => watchlist.includes(s.ticker)).length,
    RISK: cleanSignals.filter(s => s.classification === "Risk").length,
    OPPORTUNITY: cleanSignals.filter(s => s.classification === "Positive").length,
  }), [cleanSignals, watchlist]);

  const displayedSignals = filteredSignals;

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
        <FeedHeader filter={feedFilter} setFilter={setFeedFilter} count={displayedSignals.length} tabCounts={tabCounts} />

        {/* Notification permission prompt */}
        {showNotifPrompt && (
          <div style={{
            background: "#0066FF0a",
            border: "1px solid #0066FF20",
            borderLeft: "2px solid #0066FF",
            padding: "10px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}>
            <span style={{ fontSize: "11px", color: "#555", fontFamily: "'IBM Plex Mono', monospace" }}>
              Enable notifications to get alerts when filings arrive
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={async () => { await requestPermission(); setShowNotifPrompt(false); }}
                style={{
                  padding: "4px 10px", background: "#0066FF", border: "none",
                  color: "#fff", fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: "10px", letterSpacing: "0.06em", cursor: "pointer",
                }}
              >
                ENABLE
              </button>
              <button
                onClick={() => setShowNotifPrompt(false)}
                style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: "16px" }}
              >
                ×
              </button>
            </div>
          </div>
        )}


        {/* FIX 2: Skeleton → Empty → Feed */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0" }} data-testid="signals-feed">
          {signalsLoading ? (
            <SignalSkeleton count={8} />
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
        {/* FIX 8: Right panel skeletons */}
        {signalsLoading ? <StatsSkeleton /> : <TodayStats signals={displayedSignals} />}
        <TopSignals signals={cleanSignals} watchlist={watchlist} />
        <MarketBrief brief={brief} isGenerating={briefLoading} briefAge={briefAge} />
        {watchlistLoading ? <WatchlistSkeleton /> : <WatchlistZone watchlist={watchlist} signals={allSignals} onAdd={addTicker} onRemove={removeTicker} />}
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
