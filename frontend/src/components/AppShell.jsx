// AppShell.jsx — Shared layout shell for all private pages
// Provides sidebar nav with Signal Trigger + top status bar
import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { supabase } from '../lib/supabase';
import MarketPulse from './MarketPulse';
import axios from 'axios';

// Initialize theme from localStorage on app load
if (typeof window !== 'undefined' && localStorage.getItem('afi_theme') === 'light') {
  document.body.classList.add('theme-light');
}

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function PageWrapper({ children }) {
    const location = useLocation();
    const [opacity, setOpacity] = useState(1);
    const prevPath = useRef(location.pathname);

    useEffect(() => {
        if (location.pathname !== prevPath.current) {
            setOpacity(0);
            const t = setTimeout(() => {
                prevPath.current = location.pathname;
                setOpacity(1);
            }, 60);
            return () => clearTimeout(t);
        }
    }, [location.pathname]);

    return (
        <div style={{
            gridRow: '2',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            opacity,
            transition: 'opacity 150ms ease',
        }}>
            {children}
        </div>
    );
}

export default function AppShell({ children }) {
    const { user, authHeaders, logout } = useAuth();
    const { backendOnline, agentStatus: contextAgentStatus, filedToday: contextFiledToday, nextPoll: contextNextPoll } = useAppData();
    const navigate = useNavigate();

    // Theme toggle
    const [isLight, setIsLight] = useState(() => {
        return typeof window !== 'undefined' && document.body.classList.contains('theme-light');
    });

    const toggleTheme = useCallback(() => {
        setIsLight(prev => !prev);
    }, []);

    // Sync theme state with DOM and localStorage
    useEffect(() => {
        if (isLight) {
            document.body.classList.add('theme-light');
            localStorage.setItem('afi_theme', 'light');
        } else {
            document.body.classList.remove('theme-light');
            localStorage.setItem('afi_theme', 'dark');
        }
    }, [isLight]);

    // Use context-based status (agentStatus is already a string, not an object)
    const agentStatus = contextAgentStatus || 'stopped';
    const filedToday = contextFiledToday || 0;
    const [countdown, setCountdown] = useState(null);
    const countdownRef = useRef(null);

    // Signal Trigger state
    const [triggerQuery, setTriggerQuery] = useState('');
    const [triggerResults, setTriggerResults] = useState([]);
    const [triggerSearching, setTriggerSearching] = useState(false);
    const [triggerOpen, setTriggerOpen] = useState(true);
    const [triggerRunning, setTriggerRunning] = useState(false); // LOCK — prevent double-fire
    const [activeTicker, setActiveTicker] = useState(null);
    const triggerUnlockRef = useRef(null);

    // Countdown timer
    useEffect(() => {
        if (contextNextPoll == null) return;
        setCountdown(contextNextPoll);
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 0) return 0;
                return prev - 1;
            });
        }, 1000);
        return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
    }, [contextNextPoll]);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        if (logout) logout();
        navigate('/');
    };

    // Trigger a ticker through the pipeline
    const fireTrigger = useCallback(async (ticker) => {
        if (triggerRunning) return; // LOCK — ignore double-clicks
        const clean = ticker.trim().toUpperCase();
        if (!clean) return;

        // Immediately navigate to logs so the user sees the run start
        navigate('/logs');
        setActiveTicker(clean);
        setTriggerRunning(true);
        setTriggerQuery('');
        setTriggerResults([]);

        // Auto-unlock after 120s max (safety valve)
        if (triggerUnlockRef.current) clearTimeout(triggerUnlockRef.current);
        triggerUnlockRef.current = setTimeout(() => {
            setTriggerRunning(false);
            setActiveTicker(null);
        }, 120_000);

        try {
            await axios.post(`${API}/demo/trigger-all`, { ticker: clean });
        } catch (err) {
            console.error('Signal trigger failed:', err);
        } finally {
            setTriggerRunning(false);
            setActiveTicker(null);
        }
    }, [triggerRunning, navigate]);

    const navItems = [
        { to: '/dashboard', label: 'FEED', icon: '◈' },
        { to: '/graph', label: 'GRAPH', icon: '⬡' },
        { to: '/leaderboard', label: 'DIVERGENCE', icon: '⚠' },
        { to: '/watchlist', label: 'WATCHLIST', icon: '◎' },
        { to: '/runs', label: 'SWEEPS', icon: '▤' },
        { to: '/logs', label: 'LOGS', icon: '⊡' },
        { to: '/settings', label: 'SETTINGS', icon: '⊙' },
    ];

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: '200px 1fr',
            gridTemplateRows: '36px 1fr',
            height: '100vh',
            overflow: 'hidden',
            background: 'var(--bg-base)',
            fontFamily: "'JetBrains Mono', monospace",
        }}>

            {/* ── TOP STATUS BAR ── */}
            <div style={{
                gridColumn: '1 / -1',
                gridRow: '1',
                borderBottom: '1px solid var(--border-default)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px',
                gap: '0',
                background: 'var(--bg-surface)',
            }}>
                {/* Agent status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', paddingRight: '16px', borderRight: '1px solid var(--border-default)' }}>
                    <div style={{
                        width: '5px', height: '5px',
                        borderRadius: '50%',
                        background: agentStatus === 'running' ? 'var(--signal-positive)' : 'var(--signal-risk)',
                        animation: agentStatus === 'running' ? 'pulse-green 3s ease-in-out infinite' : 'none',
                        flexShrink: 0,
                    }} />
                    <span style={{ fontSize: '10px', color: agentStatus === 'running' ? 'var(--signal-positive)' : 'var(--signal-risk)', letterSpacing: '0.1em', fontFamily: "'JetBrains Mono', monospace" }}>
                        {agentStatus === 'running' ? 'MONITORING SEC EDGAR' : 'EDGAR AGENT OFFLINE'}
                    </span>
                </div>

                {/* Countdown */}
                {countdown != null && countdown > 0 && (
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.06em', padding: '0 16px', borderRight: '1px solid var(--border-default)', fontFamily: "'JetBrains Mono', monospace" }}>
                        NEXT POLL: {countdown}s
                    </span>
                )}

                {/* Filed today */}
                {filedToday > 0 && (
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", padding: '0 16px', borderRight: '1px solid var(--border-default)' }}>
                        {filedToday} FILINGS TODAY
                    </span>
                )}

                {/* Market Pulse Score */}
                <MarketPulse />

                <div style={{ flex: 1 }} />

                {/* Theme toggle button */}
                <button
                    onClick={toggleTheme}
                    title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
                    style={{
                        background: 'transparent',
                        border: '1px solid var(--border-default)',
                        color: 'var(--text-secondary)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        lineHeight: 1,
                        marginRight: '12px',
                        transition: 'all 100ms',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
                >
                    {isLight ? '☾' : '☀'}
                </button>

                {/* Backend ONLINE/OFFLINE badge */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '2px 10px',
                    border: `1px solid ${backendOnline === true ? 'var(--signal-positive)' : backendOnline === false ? 'var(--signal-risk)' : 'var(--text-tertiary)'}33`,
                    background: `${backendOnline === true ? 'var(--signal-positive)' : backendOnline === false ? 'var(--signal-risk)' : 'var(--text-tertiary)'}10`,
                }}>
                    <div style={{
                        width: '4px', height: '4px',
                        borderRadius: '50%',
                        background: backendOnline === true ? 'var(--signal-positive)' : backendOnline === false ? 'var(--signal-risk)' : 'var(--text-tertiary)',
                    }} />
                    <span style={{ fontSize: '9px', color: backendOnline === true ? 'var(--signal-positive)' : backendOnline === false ? 'var(--signal-risk)' : 'var(--text-tertiary)', letterSpacing: '0.12em', fontFamily: "'JetBrains Mono', monospace" }}>
                        {backendOnline === true ? 'ONLINE' : backendOnline === false ? 'OFFLINE' : '---'}
                    </span>
                </div>
            </div>

            {/* ── LEFT SIDEBAR ── */}
            <div style={{
                gridRow: '2',
                borderRight: '1px solid var(--border-default)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: 'var(--bg-sidebar)',
            }}>
                {/* Logo */}
                <div style={{ padding: '20px 16px 20px', borderBottom: '1px solid var(--border-default)' }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.1em' }}>
                        AFI
                    </div>
                    <div style={{ fontSize: '8px', color: 'var(--text-tertiary)', letterSpacing: '0.18em', marginTop: '2px' }}>
                        FILING INTELLIGENCE
                    </div>
                </div>

                {/* Nav */}
                <nav style={{ padding: '8px 0' }}>
                    {navItems.map(({ to, label, icon }) => (
                        <NavLink
                            key={to}
                            to={to}
                            style={({ isActive }) => ({
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '9px 16px',
                                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                                textDecoration: 'none',
                                fontSize: '10px',
                                letterSpacing: '0.1em',
                                borderLeft: isActive ? '2px solid var(--accent-blue)' : '2px solid transparent',
                                background: isActive ? 'var(--bg-active)' : 'transparent',
                                transition: 'color 100ms',
                            })}
                        >
                            <span style={{ fontSize: '12px' }}>{icon}</span>
                            {label}
                        </NavLink>
                    ))}
                </nav>

                {/* ── SIGNAL TRIGGER ── */}
                <div style={{ borderTop: '1px solid var(--border-default)', flex: 1, overflowY: 'auto' }}>
                    <div
                        onClick={() => setTriggerOpen(!triggerOpen)}
                        style={{
                            padding: '10px 16px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }}
                    >
                        <span style={{ fontSize: '8px', color: 'var(--accent-blue)', letterSpacing: '0.14em', fontWeight: 700 }}>
                            SIGNAL TRIGGER
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                            {triggerOpen ? '−' : '+'}
                        </span>
                    </div>

                    {triggerOpen && (
                        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

                            {/* Active run banner */}
                            {triggerRunning && activeTicker && (
                                <div style={{
                                    padding: '5px 8px', fontSize: '9px', letterSpacing: '0.08em',
                                    color: 'var(--filing-10k)', border: '1px solid var(--filing-10k)22', background: 'var(--filing-10k)08',
                                    display: 'flex', alignItems: 'center', gap: '7px',
                                }}>
                                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--filing-10k)', animation: 'pulse 1.5s infinite' }} />
                                    {activeTicker} RUNNING
                                </div>
                            )}

                            {/* Quick-fire buttons */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
                                {['TSLA', 'NVDA', 'AAPL', 'MSFT', 'AMZN', 'COIN'].map(t => {
                                    const isActive = activeTicker === t;
                                    const locked = triggerRunning && !isActive;
                                    return (
                                        <button
                                            key={t}
                                            onClick={() => fireTrigger(t)}
                                            disabled={locked}
                                            title={locked ? 'Run in progress — wait for it to complete' : `Trigger ${t} pipeline sweep`}
                                            style={{
                                                background: isActive ? 'var(--filing-10k)18' : 'var(--bg-card)',
                                                border: `1px solid ${isActive ? 'var(--filing-10k)' : 'var(--border-default)'}`,
                                                color: isActive ? 'var(--filing-10k)' : locked ? 'var(--text-muted)' : 'var(--text-tertiary)',
                                                padding: '5px 0', fontSize: '9px',
                                                cursor: locked ? 'not-allowed' : 'pointer',
                                                letterSpacing: '0.04em', fontFamily: "'JetBrains Mono', monospace",
                                                transition: 'all 150ms', textAlign: 'center', borderRadius: '2px',
                                                opacity: locked ? 0.4 : 1,
                                            }}
                                        >
                                            {isActive ? '...' : t}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Custom ticker with autocomplete */}
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <input
                                        type="text"
                                        placeholder="SEARCH TICKER"
                                        value={triggerQuery}
                                        onChange={(e) => {
                                            const val = e.target.value.toUpperCase();
                                            setTriggerQuery(val);
                                            if (!val.trim()) { setTriggerResults([]); return; }
                                            setTriggerSearching(true);
                                            axios.get(`${API}/ticker/search?q=${encodeURIComponent(val)}`)
                                                .then(res => setTriggerResults(res.data.results || [{ ticker: val, name: val }]))
                                                .catch(() => setTriggerResults([{ ticker: val, name: val }]))
                                                .finally(() => setTriggerSearching(false));
                                        }}
                                        style={{
                                            background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)',
                                            padding: '5px 7px', fontSize: '9px', width: '100%',
                                            fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em',
                                            textTransform: 'uppercase', borderRadius: '3px', boxSizing: 'border-box',
                                        }}
                                        onKeyDown={async (e) => {
                                            if (e.key === 'Escape') { setTriggerQuery(''); setTriggerResults([]); }
                                            if (e.key === 'Enter' && triggerQuery.trim()) {
                                                await fireTrigger(triggerQuery.trim());
                                            }
                                        }}
                                        onBlur={() => setTimeout(() => setTriggerResults([]), 200)}
                                    />
                                    {triggerSearching && (
                                        <span style={{ position: 'absolute', right: '7px', top: '6px', fontSize: '8px', color: 'var(--text-tertiary)' }}>...</span>
                                    )}
                                    {triggerResults.length > 0 && (
                                        <div style={{
                                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                                            background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderTop: 'none',
                                            borderRadius: '0 0 3px 3px', boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
                                        }}>
                                            {triggerResults.slice(0, 5).map((r, i) => (
                                                <div
                                                    key={i}
                                                    onClick={() => fireTrigger(r.ticker)}
                                                    style={{
                                                        padding: '5px 7px', fontSize: '8px', cursor: 'pointer',
                                                        fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-secondary)',
                                                        borderBottom: i < Math.min(triggerResults.length, 5) - 1 ? '1px solid var(--border-default)' : 'none',
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                                                >
                                                    <strong style={{ color: 'var(--text-secondary)' }}>{r.ticker}</strong>
                                                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '8px', color: 'var(--text-tertiary)', marginLeft: '6px' }}>{r.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => triggerQuery.trim() && fireTrigger(triggerQuery.trim())}
                                    style={{
                                        background: 'var(--accent-blue-bg)', border: '1px solid var(--accent-blue-border)', color: 'var(--accent-blue)',
                                        padding: '0 10px', fontSize: '9px', cursor: 'pointer',
                                        fontFamily: "'JetBrains Mono', monospace", borderRadius: '3px',
                                        transition: 'all 100ms', fontWeight: 700, letterSpacing: '0.04em'
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-blue)'; e.currentTarget.style.color = 'white'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent-blue-bg)'; e.currentTarget.style.color = 'var(--accent-blue)'; }}
                                >
                                    RUN
                                </button>
                            </div>

                            <div style={{ fontSize: '7px', color: 'var(--text-muted)', letterSpacing: '0.06em', lineHeight: 1.5 }}>
                                Runs all 6 form types through the full pipeline. Results appear in the feed + Telegram.
                            </div>
                        </div>
                    )}
                </div>

                {/* Bottom — account */}
                <div style={{ borderTop: '1px solid var(--border-default)', padding: '12px 14px' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {user?.email?.split('@')[0] || '—'}
                    </div>
                    <div style={{
                        fontSize: '8px',
                        color: 'var(--text-muted)',
                        letterSpacing: '0.12em',
                        marginBottom: '10px',
                    }}>
                        RETAIL
                    </div>
                    <button
                        onClick={handleSignOut}
                        style={{
                            width: '100%',
                            padding: '6px 0',
                            background: 'transparent',
                            border: '1px solid var(--border-default)',
                            color: 'var(--text-secondary)',
                            fontSize: '9px',
                            letterSpacing: '0.1em',
                            cursor: 'pointer',
                            transition: 'all 150ms',
                            textAlign: 'center',
                            fontFamily: "'JetBrains Mono', monospace",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--signal-risk)'; e.currentTarget.style.color = 'var(--signal-risk)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                    >
                        SIGN OUT
                    </button>
                </div>
            </div>

            {/* ── MAIN CONTENT ── */}
            <PageWrapper>
                {children}
            </PageWrapper>

        </div>
    );
}
