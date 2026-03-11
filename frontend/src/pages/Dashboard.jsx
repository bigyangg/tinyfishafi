// Dashboard.jsx — Live filing feed + right panel
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import AppShell from '../components/AppShell';
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

// StatusBar and agent polling now handled by AppShell

// ── CATEGORY SYSTEM ──
const CATEGORY_MAP = {
  EARNINGS_BEAT: { group: 'EARNINGS & FINANCIAL', priority: 1 },
  EARNINGS_MISS: { group: 'EARNINGS & FINANCIAL', priority: 1 },
  DIVIDEND: { group: 'EARNINGS & FINANCIAL', priority: 1 },
  DEBT_FINANCING: { group: 'EARNINGS & FINANCIAL', priority: 1 },
  ASSET_SALE: { group: 'EARNINGS & FINANCIAL', priority: 1 },
  EXEC_DEPARTURE: { group: 'LEADERSHIP & CORP EVENTS', priority: 2 },
  EXEC_APPOINTMENT: { group: 'LEADERSHIP & CORP EVENTS', priority: 2 },
  MERGER_ACQUISITION: { group: 'LEADERSHIP & CORP EVENTS', priority: 2 },
  MATERIAL_EVENT: { group: 'LEADERSHIP & CORP EVENTS', priority: 2 },
  LEGAL_REGULATORY: { group: 'REGULATORY & LEGAL', priority: 3 },
  ROUTINE_ADMIN: { group: 'ROUTINE FILINGS', priority: 4 },
};

const GROUP_COLORS = {
  'EARNINGS & FINANCIAL': '#00C805',
  'LEADERSHIP & CORP EVENTS': '#FF6B00',
  'REGULATORY & LEGAL': '#FF3333',
  'ROUTINE FILINGS': '#1e1e1e',
};

const getCategory = (signal) => {
  if (!signal.event_type || signal.event_type === 'ROUTINE_ADMIN') {
    if ((signal.impact_score || 0) >= 50 && signal.classification !== 'Neutral') {
      return { group: 'LEADERSHIP & CORP EVENTS', priority: 2 };
    }
    return { group: 'ROUTINE FILINGS', priority: 4 };
  }
  return CATEGORY_MAP[signal.event_type] || { group: 'ROUTINE FILINGS', priority: 4 };
};

// ── CATEGORY SECTION (collapsible accordion) ──
const CategorySection = ({ name, signals: sigs, watchlist, onToggleWatch, onSelect, color, dimmed }) => {
  const [collapsed, setCollapsed] = useState(name === 'ROUTINE FILINGS');

  const previewTickers = sigs.slice(0, 3).map(s => s.ticker);

  return (
    <div style={{ margin: '8px 10px' }}>
      {/* Accordion header — looks like a distinct clickable card */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '10px 14px',
          background: collapsed ? '#0c0c0c' : '#111',
          border: `1px solid ${collapsed ? '#1e1e1e' : '#282828'}`,
          borderRadius: collapsed ? '6px' : '6px 6px 0 0',
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'all 120ms',
          position: 'sticky', top: 0, zIndex: 10,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = '#141414';
          e.currentTarget.style.borderColor = '#333';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = collapsed ? '#0c0c0c' : '#111';
          e.currentTarget.style.borderColor = collapsed ? '#1e1e1e' : '#282828';
        }}
      >
        {/* Color dot */}
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: color, flexShrink: 0,
          boxShadow: dimmed ? 'none' : `0 0 6px ${color}40`,
        }} />

        {/* Category name */}
        <span style={{
          fontSize: '11px', color: dimmed ? '#555' : '#aaa',
          letterSpacing: '0.08em', fontWeight: 700,
        }}>
          {name}
        </span>

        {/* Collapsed preview tickers */}
        {collapsed && previewTickers.length > 0 && (
          <div style={{ display: 'flex', gap: '5px', marginLeft: '2px' }}>
            {previewTickers.map(t => (
              <span key={t} style={{
                fontSize: '9px', color: '#555',
                background: '#181818', padding: '2px 7px', borderRadius: '3px',
                border: '1px solid #222',
              }}>{t}</span>
            ))}
            {sigs.length > 3 && (
              <span style={{ fontSize: '9px', color: '#444', alignSelf: 'center' }}>+{sigs.length - 3}</span>
            )}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Count badge */}
        <span style={{
          fontSize: '10px', fontWeight: 700,
          color: dimmed ? '#444' : '#888',
          background: '#181818', padding: '3px 10px', borderRadius: '10px',
          border: '1px solid #222',
          minWidth: '24px', textAlign: 'center',
        }}>
          {sigs.length}
        </span>

        {/* Expand/collapse button */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          padding: '3px 8px',
          background: collapsed ? '#181818' : 'transparent',
          border: `1px solid ${collapsed ? '#2a2a2a' : '#222'}`,
          borderRadius: '4px',
          transition: 'all 120ms',
        }}>
          <span style={{
            fontSize: '9px', color: collapsed ? '#888' : '#555',
            transform: collapsed ? 'rotate(0)' : 'rotate(90deg)',
            transition: 'transform 200ms ease', display: 'inline-block',
          }}>
            ▸
          </span>
          <span style={{
            fontSize: '8px', color: collapsed ? '#666' : '#444',
            letterSpacing: '0.06em', fontWeight: 600,
          }}>
            {collapsed ? 'SHOW' : 'HIDE'}
          </span>
        </div>
      </div>

      {/* Expanded cards container */}
      {!collapsed && (
        <div style={{
          border: '1px solid #282828',
          borderTop: 'none',
          borderRadius: '0 0 6px 6px',
          background: '#090909',
          padding: '6px 0',
          overflow: 'hidden',
        }}>
          {sigs.map(signal => (
            <AlertCard
              key={signal.id}
              signal={signal}
              isWatched={watchlist.includes(signal.ticker)}
              onToggleWatch={() => onToggleWatch(signal.ticker)}
              onClick={() => onSelect(signal)}
              dimmed={dimmed}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── FEED HEADER (tabs + category counts integrated) ──
const FeedHeader = ({ filter, setFilter, count, tabCounts, categorizedSignals }) => {
  const getCount = (name) => (categorizedSignals || []).find(g => g.name === name)?.signals.length || 0;
  const catItems = [
    { label: 'EARNINGS', count: getCount('EARNINGS & FINANCIAL'), color: '#00C805' },
    { label: 'LEADERSHIP', count: getCount('LEADERSHIP & CORP EVENTS'), color: '#FF6B00' },
    { label: 'LEGAL', count: getCount('REGULATORY & LEGAL'), color: '#FF3333' },
    { label: 'ROUTINE', count: getCount('ROUTINE FILINGS'), color: '#555' },
  ].filter(i => i.count > 0);

  return (
    <div style={{ flexShrink: 0, background: '#080808', borderBottom: '1px solid #1a1a1a' }}>

      {/* Row 1: Title + Filter tabs + LIVE */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 16px',
        gap: '8px',
      }}>
        {/* Title */}
        <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff', letterSpacing: '0.04em', marginRight: '4px' }}>
          Filings
        </span>
        <span style={{ fontSize: '11px', color: '#444', marginRight: '12px' }}>{count}</span>

        {/* Tab buttons */}
        {['ALL', 'WATCHLIST', 'RISK', 'OPPORTUNITY'].map(f => {
          const isActive = filter === f;
          const tabCount = tabCounts && tabCounts[f] > 0 ? tabCounts[f] : null;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '5px 12px',
                background: isActive ? '#1a1a1a' : 'transparent',
                border: isActive ? '1px solid #2a2a2a' : '1px solid transparent',
                borderRadius: '4px',
                color: isActive ? '#fff' : '#444',
                fontSize: '10px',
                letterSpacing: '0.06em',
                cursor: 'pointer',
                transition: 'all 120ms',
                fontFamily: "'JetBrains Mono', monospace",
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.background = '#111';
                  e.currentTarget.style.borderColor = '#1e1e1e';
                  e.currentTarget.style.color = '#888';
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.color = '#444';
                }
              }}
            >
              {f}
              {tabCount && (
                <span style={{
                  fontSize: '9px',
                  color: isActive ? '#666' : '#333',
                  background: isActive ? '#222' : '#0e0e0e',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontWeight: 600,
                }}>
                  {tabCount}
                </span>
              )}
            </button>
          );
        })}

        <div style={{ flex: 1 }} />

        {/* LIVE dot */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '4px 10px',
          background: '#00C80510',
          border: '1px solid #00C80520',
          borderRadius: '4px',
        }}>
          <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#00C805', animation: 'pulse-green 2s ease-in-out infinite' }} />
          <span style={{ fontSize: '9px', color: '#00C805', letterSpacing: '0.06em', fontWeight: 600 }}>LIVE</span>
        </div>
      </div>

      {/* Row 2: Category breakdown pills */}
      {catItems.length > 0 && (
        <div style={{
          display: 'flex',
          gap: '6px',
          padding: '8px 16px 10px',
          borderTop: '1px solid #111',
        }}>
          {catItems.map(({ label, count: c, color }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              padding: '5px 14px',
              background: '#0e0e0e',
              border: '1px solid #1a1a1a',
              borderRadius: '4px',
            }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: '9px', color: '#666', letterSpacing: '0.06em' }}>{label}</span>
              <span style={{ fontSize: '12px', color: '#aaa', fontWeight: 700 }}>{c}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

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
    positive: signals.filter(s => s.classification === 'Positive').length,
    risks: signals.filter(s => s.classification === 'Risk').length,
  }), [signals]);

  return (
    <div style={{ padding: '14px', borderBottom: '1px solid #141414' }}>
      <div style={{ fontSize: '10px', color: '#555', letterSpacing: '0.1em', marginBottom: '10px', fontWeight: 600 }}>
        TODAY
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
        {[
          { label: 'FILINGS', value: stats.total, color: '#fff', bg: '#0c0c0c' },
          { label: 'POSITIVE', value: stats.positive, color: stats.positive > 0 ? '#00C805' : '#333', bg: stats.positive > 0 ? '#00C80508' : '#0c0c0c' },
          { label: 'RISK', value: stats.risks, color: stats.risks > 0 ? '#FF3333' : '#333', bg: stats.risks > 0 ? '#FF333308' : '#0c0c0c' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} style={{
            background: bg, padding: '10px 10px',
            border: '1px solid #1a1a1a', borderRadius: '4px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '8px', color: '#444', letterSpacing: '0.1em', marginTop: '5px' }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const TopSignals = ({ signals, watchlist = [] }) => {
  const topSignals = useMemo(() => {
    return [...signals]
      .filter(s => s.classification !== 'Neutral' || (s.impact_score || 0) >= 60)
      .sort((a, b) => (b.impact_score || 0) - (a.impact_score || 0))
      .slice(0, 5);
  }, [signals]);

  return (
    <div style={{ padding: '14px', borderBottom: '1px solid #141414' }}>
      <div style={{ fontSize: '10px', color: '#555', letterSpacing: '0.1em', marginBottom: '10px', fontWeight: 600 }}>
        TOP SIGNALS
      </div>
      {topSignals.length === 0 ? (
        <p style={{ fontSize: '11px', color: '#333', margin: 0 }}>No notable signals yet</p>
      ) : topSignals.map((s, i) => {
        const sColor = s.classification === 'Positive' ? '#00C805' : s.classification === 'Risk' ? '#FF3333' : '#888';
        const impactColor = (s.impact_score || 0) >= 70 ? '#FF3333' : (s.impact_score || 0) >= 50 ? '#FFB300' : '#444';
        return (
          <div key={s.id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '7px 8px', marginBottom: '3px',
            background: '#0c0c0c', border: '1px solid #141414', borderRadius: '4px',
            borderLeft: `3px solid ${sColor}`,
          }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', minWidth: 0 }}>
              {watchlist.includes(s.ticker) && (
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#0066FF', flexShrink: 0 }} />
              )}
              <span style={{ fontSize: '12px', fontWeight: 700, color: sColor }}>{s.ticker}</span>
              <span style={{ fontSize: '10px', color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(EVENT_META[s.event_type] || { label: '8-K' }).label}
              </span>
            </div>
            <span style={{ fontSize: '11px', color: impactColor, fontWeight: 600, flexShrink: 0, marginLeft: '8px' }}>
              {s.impact_score || 0}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const MarketBrief = ({ brief, isGenerating, briefAge }) => {
  return (
    <div style={{ padding: '14px', borderBottom: '1px solid #141414' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            width: '5px', height: '5px', borderRadius: '50%',
            background: isGenerating ? '#FFB300' : '#0066FF',
            animation: isGenerating ? 'pulse 1s ease infinite' : 'none',
          }} />
          <span style={{ fontSize: '10px', color: '#555', letterSpacing: '0.1em', fontWeight: 600 }}>MARKET BRIEF</span>
        </div>
        {briefAge > 0 && (
          <span style={{ fontSize: '9px', color: '#333' }}>
            {briefAge < 60 ? `${briefAge}s ago` : `${Math.floor(briefAge / 60)}m ago`}
          </span>
        )}
      </div>

      {isGenerating && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          {[100, 80, 55].map((w, i) => (
            <div key={i} style={{ height: '8px', width: `${w}%`, background: '#111', borderRadius: '2px', animation: `shimmer 1.5s ${i * 0.15}s ease infinite` }} />
          ))}
        </div>
      )}

      {!isGenerating && brief && (
        <div style={{
          background: '#0a0a0a', border: '1px solid #141414', borderRadius: '4px',
          padding: '12px', borderLeft: '3px solid #0066FF30',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {brief.split(/(?<=[.!?])\s+/).slice(0, 3).map((sentence, i) => (
              <p key={i} style={{
                margin: 0,
                fontSize: i === 0 ? '12px' : '11px',
                color: i === 0 ? '#888' : '#444',
                lineHeight: 1.55,
              }}>
                {sentence}
              </p>
            ))}
          </div>
        </div>
      )}

      {!isGenerating && !brief && (
        <p style={{ fontSize: '11px', color: '#333', margin: 0 }}>Awaiting signals...</p>
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
    <div style={{ padding: '14px', flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontSize: '10px', color: '#555', letterSpacing: '0.1em', fontWeight: 600 }}>WATCHLIST</span>
        <span style={{ fontSize: '10px', color: '#444' }}>{watchlist.length}/10</span>
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
  const navigate = useNavigate();
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

  // Health check + agent status handled by AppShell

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

  // Check health + agent status now in AppShell

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
      const [sigResult, wlResult] = await Promise.allSettled([
        axios.get(`${API}/signals?limit=50`, { headers: authHeaders() }),
        axios.get(`${API}/watchlist`, { headers: authHeaders() }),
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

  // Signal polling (health + agent check handled by AppShell)
  useEffect(() => {
    const signalInterval = setInterval(async () => {
      try {
        const res = await axios.get(`${API}/signals?limit=50`, { headers: authHeaders() });
        const signals = res.data.signals || [];
        setAllSignals(signals);
        saveCache(SIGNAL_CACHE_KEY, signals);
      } catch { }
    }, 45000);

    return () => clearInterval(signalInterval);
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
    // Step 1: Apply tab filter
    let filtered;
    switch (feedFilter) {
      case 'WATCHLIST': filtered = cleanSignals.filter(s => watchlist.includes(s.ticker)); break;
      case 'RISK': filtered = cleanSignals.filter(s => s.classification === 'Risk'); break;
      case 'OPPORTUNITY': filtered = cleanSignals.filter(s => s.classification === 'Positive'); break;
      default: filtered = cleanSignals;
    }

    // Step 2: Sort — watched first, then signal type, then impact, then date
    return filtered.sort((a, b) => {
      const aWatched = watchlist.includes(a.ticker) ? 1 : 0;
      const bWatched = watchlist.includes(b.ticker) ? 1 : 0;
      if (bWatched !== aWatched) return bWatched - aWatched;

      const sigRank = { Positive: 3, Risk: 2, Neutral: 1 };
      const aSig = sigRank[a.classification] || 0;
      const bSig = sigRank[b.classification] || 0;
      if (bSig !== aSig) return bSig - aSig;

      const aImpact = a.impact_score || 0;
      const bImpact = b.impact_score || 0;
      if (bImpact !== aImpact) return bImpact - aImpact;

      return new Date(b.filed_at) - new Date(a.filed_at);
    });
  }, [cleanSignals, watchlist, feedFilter]);

  const tabCounts = useMemo(() => ({
    WATCHLIST: cleanSignals.filter(s => watchlist.includes(s.ticker)).length,
    RISK: cleanSignals.filter(s => s.classification === 'Risk').length,
    OPPORTUNITY: cleanSignals.filter(s => s.classification === 'Positive').length,
  }), [cleanSignals, watchlist]);

  // Categorize signals by event type
  const categorizedSignals = useMemo(() => {
    const groups = {};
    filteredSignals.forEach(signal => {
      const cat = getCategory(signal);
      if (!groups[cat.group]) {
        groups[cat.group] = { signals: [], priority: cat.priority };
      }
      groups[cat.group].signals.push(signal);
    });

    // Sort within each group: watched first, then impact
    Object.values(groups).forEach(g => {
      g.signals.sort((a, b) => {
        const aW = watchlist.includes(a.ticker) ? 1 : 0;
        const bW = watchlist.includes(b.ticker) ? 1 : 0;
        if (bW !== aW) return bW - aW;
        return (b.impact_score || 0) - (a.impact_score || 0);
      });
    });

    return Object.entries(groups)
      .sort(([, a], [, b]) => a.priority - b.priority)
      .map(([name, data]) => ({ name, ...data }));
  }, [filteredSignals, watchlist]);

  const displayedSignals = filteredSignals;

  return (
    <AppShell>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 260px',
        height: '100%',
        overflow: 'hidden',
      }}>

        {/* CENTER FEED */}
        <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRight: '1px solid #0a0a0a' }}>
          <FeedHeader filter={feedFilter} setFilter={setFeedFilter} count={displayedSignals.length} tabCounts={tabCounts} categorizedSignals={categorizedSignals} />

          {/* Notification permission prompt */}
          {showNotifPrompt && (
            <div style={{
              background: '#0066FF0a',
              border: '1px solid #0066FF20',
              borderLeft: '2px solid #0066FF',
              padding: '10px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: '11px', color: '#555' }}>
                Enable notifications to get alerts when filings arrive
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={async () => { await requestPermission(); setShowNotifPrompt(false); }}
                  style={{
                    padding: '4px 10px', background: '#0066FF', border: 'none',
                    color: '#fff', fontSize: '10px', letterSpacing: '0.06em', cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  ENABLE
                </button>
                <button
                  onClick={() => setShowNotifPrompt(false)}
                  style={{ background: 'none', border: 'none', color: '#333', cursor: 'pointer', fontSize: '16px' }}
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* Feed — categorized sections */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0' }} data-testid="signals-feed">
            {signalsLoading ? (
              <SignalSkeleton count={8} />
            ) : displayedSignals.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                {allSignals.length === 0 ? (
                  <>
                    <div style={{ fontSize: '11px', color: '#2a2a2a', marginBottom: '16px', letterSpacing: '0.08em' }}>
                      NO SIGNALS YET
                    </div>
                    <p style={{ fontSize: '12px', color: '#222', marginBottom: '16px' }}>
                      Agent is monitoring EDGAR. First signals will appear shortly.
                    </p>
                  </>
                ) : (
                  <div style={{ fontSize: '11px', color: '#2a2a2a', letterSpacing: '0.08em' }}>
                    NO SIGNALS MATCH FILTER
                  </div>
                )}
              </div>
            ) : (
              categorizedSignals.map(({ name, signals: sigs, priority }) => (
                <CategorySection
                  key={name}
                  name={name}
                  signals={sigs}
                  watchlist={watchlist}
                  onToggleWatch={toggleWatch}
                  onSelect={(sig) => navigate(`/signal/${sig.id}`)}
                  color={GROUP_COLORS[name]}
                  dimmed={priority === 4}
                />
              ))
            )}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          background: '#050505',
          overflowY: 'auto',
        }}>
          {signalsLoading ? <StatsSkeleton /> : <TodayStats signals={displayedSignals} />}
          <TopSignals signals={cleanSignals} watchlist={watchlist} />
          <MarketBrief brief={brief} isGenerating={briefLoading} briefAge={briefAge} />
          {watchlistLoading ? <WatchlistSkeleton /> : <WatchlistZone watchlist={watchlist} signals={allSignals} onAdd={addTicker} onRemove={removeTicker} />}
        </div>

        {/* MODAL (fallback for in-session viewing) */}
        {selectedSignal && (
          <SignalDetailModal
            signal={selectedSignal}
            onClose={() => setSelectedSignal(null)}
          />
        )}
      </div>
    </AppShell>
  );
}
