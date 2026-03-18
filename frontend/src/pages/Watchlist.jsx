// Watchlist.jsx — Stock management hub with per-ticker signal history
import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function formatRelativeTime(ts) {
    if (!ts) return '—';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

export default function Watchlist() {
    const navigate = useNavigate();
    const { user, authHeaders } = useAuth();
    const [watchlist, setWatchlist] = useState([]);
    const [signals, setSignals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        if (!user) return;
        const load = async () => {
            const [wlRes, sigRes] = await Promise.allSettled([
                axios.get(`${API}/watchlist`, { headers: authHeaders() }),
                axios.get(`${API}/signals?limit=200`),
            ]);
            if (wlRes.status === 'fulfilled') setWatchlist(wlRes.value.data.tickers || wlRes.value.data || []);
            if (sigRes.status === 'fulfilled') setSignals(sigRes.value.data.signals || []);
            setLoading(false);
        };
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    // Debounced ticker search
    useEffect(() => {
        if (!searchQuery.trim()) { setSearchResults([]); return; }
        const t = setTimeout(async () => {
            setSearching(true);
            try {
                const r = await axios.get(`${API}/ticker/search?q=${encodeURIComponent(searchQuery)}`);
                setSearchResults(r.data.results || []);
            } catch {
                setSearchResults([{ ticker: searchQuery.toUpperCase(), name: searchQuery.toUpperCase() }]);
            } finally {
                setSearching(false);
            }
        }, 250);
        return () => clearTimeout(t);
    }, [searchQuery]);

    // Per-ticker signal summary
    const tickerData = useMemo(() => {
        return watchlist.map(ticker => {
            const tickerSignals = signals.filter(s => s.ticker === ticker);
            const latest = tickerSignals[0] || null;
            const totalFilings = tickerSignals.length;
            const positives = tickerSignals.filter(s => s.classification === 'Positive').length;
            const risks = tickerSignals.filter(s => s.classification === 'Risk').length;
            const avgImpact = totalFilings > 0
                ? Math.round(tickerSignals.reduce((sum, s) => sum + (s.impact_score || 0), 0) / totalFilings)
                : 0;
            return { ticker, latest, totalFilings, positives, risks, avgImpact };
        });
    }, [watchlist, signals]);

    const addTicker = async (ticker) => {
        ticker = ticker.toUpperCase();
        if (watchlist.includes(ticker) || watchlist.length >= 10) return;
        const updated = [...watchlist, ticker];
        setWatchlist(updated);
        setSearchQuery('');
        setSearchResults([]);
        try {
            const res = await axios.post(`${API}/watchlist`, { ticker }, { headers: authHeaders() });
            setWatchlist(res.data.tickers || updated);
        } catch {
            setWatchlist(watchlist); // rollback
        }
    };

    const removeTicker = async (ticker) => {
        const updated = watchlist.filter(t => t !== ticker);
        setWatchlist(updated);
        try {
            const res = await axios.delete(`${API}/watchlist/${ticker}`, { headers: authHeaders() });
            setWatchlist(res.data.tickers || updated);
        } catch {
            setWatchlist(watchlist);
        }
    };

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

                {/* PAGE HEADER */}
                <div style={{
                    padding: '20px 24px 16px',
                    borderBottom: '1px solid #0d0d0d',
                    flexShrink: 0,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#fff', letterSpacing: '0.1em' }}>
                                WATCHLIST
                            </h1>
                            <p style={{ margin: '3px 0 0', fontSize: '11px', color: '#333' }}>
                                {watchlist.length}/10 tickers monitored
                            </p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '80px', height: '2px', background: '#111' }}>
                                <div style={{
                                    height: '100%',
                                    width: `${(watchlist.length / 10) * 100}%`,
                                    background: watchlist.length >= 9 ? '#FF3333' : '#0066FF',
                                    transition: 'width 300ms',
                                }} />
                            </div>
                            <span style={{ fontSize: '10px', color: '#333' }}>{watchlist.length}/10</span>
                        </div>
                    </div>
                </div>

                {/* SEARCH BAR */}
                <div style={{ padding: '16px 24px', borderBottom: '1px solid #0d0d0d', flexShrink: 0, position: 'relative' }}>
                    <div style={{ position: 'relative', maxWidth: '400px' }}>
                        <input
                            ref={inputRef}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && searchQuery && addTicker(searchQuery)}
                            placeholder="Search ticker or company name..."
                            style={{
                                width: '100%',
                                background: '#0a0a0a',
                                border: '1px solid #1e1e1e',
                                color: '#fff',
                                padding: '10px 14px',
                                fontSize: '12px',
                                fontFamily: "'JetBrains Mono', monospace",
                                outline: 'none',
                                boxSizing: 'border-box',
                                transition: 'border-color 150ms',
                            }}
                            onFocus={e => e.target.style.borderColor = '#333'}
                            onBlur={e => { if (!searchQuery) e.target.style.borderColor = '#1e1e1e'; }}
                        />
                        {searching && (
                            <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: '#333' }}>
                                ···
                            </span>
                        )}
                    </div>

                    {/* Search dropdown */}
                    {searchResults.length > 0 && (
                        <div style={{
                            position: 'absolute',
                            top: 'calc(100% - 16px)',
                            left: '24px',
                            width: '400px',
                            border: '1px solid #1a1a1a',
                            background: '#080808',
                            zIndex: 50,
                            boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
                        }}>
                            {searchResults.slice(0, 6).map(r => {
                                const alreadyAdded = watchlist.includes(r.ticker);
                                return (
                                    <button
                                        key={r.ticker}
                                        onClick={() => !alreadyAdded && addTicker(r.ticker)}
                                        disabled={alreadyAdded || watchlist.length >= 10}
                                        style={{
                                            width: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '10px 14px',
                                            background: 'transparent',
                                            border: 'none',
                                            borderBottom: '1px solid #0d0d0d',
                                            cursor: alreadyAdded ? 'default' : 'pointer',
                                            transition: 'background 100ms',
                                            fontFamily: "'JetBrains Mono', monospace",
                                        }}
                                        onMouseEnter={e => !alreadyAdded && (e.currentTarget.style.background = '#0f0f0f')}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 700, fontSize: '13px', color: alreadyAdded ? '#2a2a2a' : '#fff', minWidth: '50px' }}>
                                                {r.ticker}
                                            </span>
                                            <span style={{ fontSize: '11px', color: '#444' }}>
                                                {r.name?.length > 30 ? r.name.slice(0, 30) + '…' : r.name}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '11px', color: alreadyAdded ? '#1e1e1e' : '#333' }}>
                                            {alreadyAdded ? 'ADDED' : '+'}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* TICKER CARDS GRID */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                    {loading ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                            {[1, 2, 3].map(i => (
                                <div key={i} style={{ height: '140px', background: '#0a0a0a', border: '1px solid #0d0d0d', animation: 'sk 1.5s ease infinite' }} />
                            ))}
                        </div>
                    ) : watchlist.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
                            <p style={{ fontSize: '11px', color: '#1e1e1e', letterSpacing: '0.1em' }}>NO TICKERS WATCHED</p>
                            <p style={{ fontSize: '11px', color: '#111', marginTop: '8px' }}>Search above to add up to 10 tickers</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '8px' }}>
                            {tickerData.map(({ ticker, latest, totalFilings, positives, risks, avgImpact }) => (
                                <TickerCard
                                    key={ticker}
                                    ticker={ticker}
                                    latest={latest}
                                    totalFilings={totalFilings}
                                    positives={positives}
                                    risks={risks}
                                    avgImpact={avgImpact}
                                    signals={signals}
                                    onRemove={() => removeTicker(ticker)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <style>{`
                .filing-row:hover { background: #0a0a0a !important; }
                .filing-row:hover .view-hint { color: #0066FF !important; }
            `}</style>
        </>
    );
}

// ── TICKER CARD with inline filing expand ──
function TickerCard({ ticker, latest, totalFilings, positives, risks, avgImpact, signals, onRemove }) {
    const [expanded, setExpanded] = useState(false);

    const tickerSignals = useMemo(() =>
        signals
            .filter(s => s.ticker === ticker && s.summary && s.classification !== 'Pending')
            .sort((a, b) => new Date(b.filed_at) - new Date(a.filed_at))
            .slice(0, 5),
        [signals, ticker]);

    const sigColor = !latest ? '#1e1e1e'
        : latest.classification === 'Positive' ? '#00C805'
            : latest.classification === 'Risk' ? '#FF3333'
                : '#333';

    return (
        <div style={{
            background: '#080808',
            border: '1px solid #0d0d0d',
            borderTop: `2px solid ${sigColor}`,
            transition: 'border-color 100ms',
        }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#1a1a1a'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#0d0d0d'}
        >
            {/* Card header */}
            <div style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', letterSpacing: '0.08em' }}>
                            {ticker}
                        </div>
                        {latest && (
                            <div style={{ fontSize: '10px', color: sigColor, marginTop: '2px' }}>
                                {latest.classification} · {latest.confidence}% conf
                            </div>
                        )}
                    </div>
                    <button
                        onClick={onRemove}
                        style={{ background: 'none', border: 'none', color: '#1e1e1e', cursor: 'pointer', fontSize: '16px', padding: '0', lineHeight: 1, transition: 'color 150ms' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#FF3333'}
                        onMouseLeave={e => e.currentTarget.style.color = '#1e1e1e'}
                    >×</button>
                </div>

                {/* Latest summary */}
                {latest?.summary ? (
                    <p style={{ fontSize: '11px', color: '#444', lineHeight: 1.5, margin: '0 0 12px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {latest.summary}
                    </p>
                ) : (
                    <p style={{ fontSize: '11px', color: '#1e1e1e', fontStyle: 'italic', margin: '0 0 12px' }}>
                        No filings detected yet
                    </p>
                )}

                {/* Stats */}
                <div style={{ display: 'flex', gap: '20px', marginBottom: '12px' }}>
                    {[
                        { label: 'FILINGS', value: totalFilings, color: '#555' },
                        { label: 'POSITIVE', value: positives, color: positives > 0 ? '#00C805' : '#1e1e1e' },
                        { label: 'RISK', value: risks, color: risks > 0 ? '#FF3333' : '#1e1e1e' },
                        { label: 'AVG IMPACT', value: avgImpact, color: avgImpact >= 55 ? '#FFB300' : '#333' },
                    ].map(({ label, value, color }) => (
                        <div key={label}>
                            <div style={{ fontSize: '14px', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
                            <div style={{ fontSize: '8px', color: '#1e1e1e', letterSpacing: '0.1em', marginTop: '2px' }}>{label}</div>
                        </div>
                    ))}
                </div>

                {/* Toggle expand */}
                {tickerSignals.length > 0 && (
                    <button
                        onClick={() => setExpanded(prev => !prev)}
                        style={{
                            background: 'transparent',
                            border: '1px solid #111',
                            color: '#2a2a2a',
                            padding: '5px 10px',
                            fontSize: '9px',
                            letterSpacing: '0.1em',
                            cursor: 'pointer',
                            fontFamily: "'JetBrains Mono', monospace",
                            transition: 'all 150ms',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#888'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#111'; e.currentTarget.style.color = '#2a2a2a'; }}
                    >
                        {expanded ? 'HIDE FILINGS ↑' : `VIEW ${tickerSignals.length} FILING${tickerSignals.length !== 1 ? 'S' : ''} ↓`}
                    </button>
                )}
            </div>

            {/* Expanded filings list */}
            {expanded && tickerSignals.length > 0 && (
                <div style={{ borderTop: '1px solid #0d0d0d' }}>
                    {tickerSignals.map((s, i) => {
                        const sColor = s.classification === 'Positive' ? '#00C805' : s.classification === 'Risk' ? '#FF3333' : '#2a2a2a';
                        return (
                            <div
                                key={s.id}
                                className="filing-row"
                                style={{
                                    padding: '12px 16px',
                                    borderBottom: i < tickerSignals.length - 1 ? '1px solid #0a0a0a' : 'none',
                                    borderLeft: `2px solid ${sColor}`,
                                    background: '#060606',
                                    cursor: 'pointer',
                                    transition: 'background 100ms',
                                }}
                                onClick={() => window.open(`/signal/${s.id}`, '_blank')}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <span style={{ fontSize: '10px', color: sColor, letterSpacing: '0.06em' }}>
                                            {s.classification}
                                        </span>
                                        {s.event_type && s.event_type !== 'ROUTINE_ADMIN' && (
                                            <span style={{ fontSize: '9px', color: '#0066FF' }}>
                                                {s.event_type.replace(/_/g, ' ')}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                        {(s.impact_score || 0) >= 40 && (
                                            <span style={{ fontSize: '10px', color: '#333' }}>{s.impact_score}</span>
                                        )}
                                        <span style={{ fontSize: '9px', color: '#161616', letterSpacing: '0.06em' }} className="view-hint">
                                            VIEW INFO ↗
                                        </span>
                                        <span style={{ fontSize: '10px', color: '#222' }}>
                                            {formatRelativeTime(s.filed_at)}
                                        </span>
                                    </div>
                                </div>
                                <p style={{ margin: 0, fontSize: '11px', color: '#444', lineHeight: 1.5 }}>
                                    {s.summary?.slice(0, 120)}{s.summary?.length > 120 ? '…' : ''}
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
