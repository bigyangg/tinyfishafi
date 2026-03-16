// AppShell.jsx — Shared layout shell for all private pages
// Provides sidebar nav with Signal Trigger + top status bar
import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function AppShell({ children }) {
    const { user, authHeaders, logout } = useAuth();
    const navigate = useNavigate();

    // Agent status
    const [agentStatus, setAgentStatus] = useState('not_initialized');
    const [filedToday, setFiledToday] = useState(0);
    const [nextPoll, setNextPoll] = useState(null);
    const [backendOnline, setBackendOnline] = useState(true); // Optimistic UI prevents red flicker
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

    const checkHealth = useCallback(async () => {
        try {
            await axios.get(`${API}/health`);
            setBackendOnline(true);
        } catch {
            setBackendOnline(false);
        }
    }, []);

    const fetchAgentStatus = useCallback(async () => {
        try {
            const res = await axios.get(`${API}/edgar/status`);
            const d = res.data;
            setAgentStatus(d.agent_status || 'stopped');
            setFiledToday(d.filings_processed_today || 0);
            if (d.next_poll_seconds != null) {
                setNextPoll(d.next_poll_seconds);
            }
        } catch { }
    }, []);

    // Polling
    useEffect(() => {
        checkHealth();
        fetchAgentStatus();
        const h = setInterval(checkHealth, 30000);
        const a = setInterval(fetchAgentStatus, 20000);
        return () => { clearInterval(h); clearInterval(a); };
    }, [checkHealth, fetchAgentStatus]);

    // Countdown timer
    useEffect(() => {
        if (nextPoll == null) return;
        setCountdown(nextPoll);
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 0) return 0;
                return prev - 1;
            });
        }, 1000);
        return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
    }, [nextPoll]);

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
            await axios.post(`${API}/trigger-all`, { ticker: clean });
        } catch (err) {
            console.error('Signal trigger failed:', err);
        } finally {
            setTriggerRunning(false);
            setActiveTicker(null);
        }
    }, [triggerRunning, navigate]);

    const navItems = [
        { to: '/dashboard', label: 'FEED', icon: '◈' },
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
            background: '#050505',
            fontFamily: "'JetBrains Mono', monospace",
        }}>

            {/* ── TOP STATUS BAR ── */}
            <div style={{
                gridColumn: '1 / -1',
                gridRow: '1',
                borderBottom: '1px solid #111',
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px',
                gap: '0',
                background: '#060606',
            }}>
                {/* Agent status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', paddingRight: '16px', borderRight: '1px solid #111' }}>
                    <div style={{
                        width: '5px', height: '5px',
                        borderRadius: '50%',
                        background: agentStatus === 'running' ? '#27AE60' : '#E74C3C',
                        animation: agentStatus === 'running' ? 'pulse-green 3s ease-in-out infinite' : 'none',
                        flexShrink: 0,
                    }} />
                    <span style={{ fontSize: '10px', color: agentStatus === 'running' ? '#6FCF97' : '#EB5757', letterSpacing: '0.1em', fontFamily: "'JetBrains Mono', monospace" }}>
                        {agentStatus === 'running' ? 'MONITORING SEC EDGAR' : 'EDGAR AGENT OFFLINE'}
                    </span>
                </div>

                {/* Countdown */}
                {countdown != null && countdown > 0 && (
                    <span style={{ fontSize: '10px', color: '#555', letterSpacing: '0.06em', padding: '0 16px', borderRight: '1px solid #111', fontFamily: "'JetBrains Mono', monospace" }}>
                        NEXT POLL: {countdown}s
                    </span>
                )}

                {/* Filed today */}
                {filedToday > 0 && (
                    <span style={{ fontSize: '10px', color: '#555', fontFamily: "'JetBrains Mono', monospace", padding: '0 16px', borderRight: '1px solid #111' }}>
                        {filedToday} FILINGS TODAY
                    </span>
                )}

                <div style={{ flex: 1 }} />

                {/* Backend ONLINE/OFFLINE badge */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '2px 10px',
                    border: `1px solid ${backendOnline === true ? '#27AE6030' : backendOnline === false ? '#E74C3C30' : '#333'}`,
                    background: backendOnline === true ? '#27AE6010' : backendOnline === false ? '#E74C3C10' : 'transparent',
                }}>
                    <div style={{
                        width: '4px', height: '4px',
                        borderRadius: '50%',
                        background: backendOnline === true ? '#27AE60' : backendOnline === false ? '#E74C3C' : '#555',
                    }} />
                    <span style={{ fontSize: '9px', color: backendOnline === true ? '#27AE60' : backendOnline === false ? '#E74C3C' : '#555', letterSpacing: '0.12em', fontFamily: "'JetBrains Mono', monospace" }}>
                        {backendOnline === true ? 'ONLINE' : backendOnline === false ? 'OFFLINE' : '---'}
                    </span>
                </div>
            </div>

            {/* ── LEFT SIDEBAR ── */}
            <div style={{
                gridRow: '2',
                borderRight: '1px solid #0a0a0a',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}>
                {/* Logo */}
                <div style={{ padding: '20px 16px 20px', borderBottom: '1px solid #0a0a0a' }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', letterSpacing: '0.1em' }}>
                        AFI
                    </div>
                    <div style={{ fontSize: '8px', color: '#2a2a2a', letterSpacing: '0.18em', marginTop: '2px' }}>
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
                                color: isActive ? '#fff' : '#2a2a2a',
                                textDecoration: 'none',
                                fontSize: '10px',
                                letterSpacing: '0.1em',
                                borderLeft: isActive ? '2px solid #fff' : '2px solid transparent',
                                background: isActive ? '#0a0a0a' : 'transparent',
                                transition: 'color 100ms',
                            })}
                        >
                            <span style={{ fontSize: '12px' }}>{icon}</span>
                            {label}
                        </NavLink>
                    ))}
                </nav>

                {/* ── SIGNAL TRIGGER ── */}
                <div style={{ borderTop: '1px solid #0a0a0a', flex: 1, overflowY: 'auto' }}>
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
                        <span style={{ fontSize: '8px', color: '#0066FF', letterSpacing: '0.14em', fontWeight: 700 }}>
                            SIGNAL TRIGGER
                        </span>
                        <span style={{ fontSize: '10px', color: '#333' }}>
                            {triggerOpen ? '−' : '+'}
                        </span>
                    </div>

                    {triggerOpen && (
                        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

                            {/* Active run banner */}
                            {triggerRunning && activeTicker && (
                                <div style={{
                                    padding: '5px 8px', fontSize: '9px', letterSpacing: '0.08em',
                                    color: '#C8A84B', border: '1px solid #C8A84B22', background: '#C8A84B08',
                                    display: 'flex', alignItems: 'center', gap: '7px',
                                }}>
                                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#C8A84B', animation: 'pulse 1.5s infinite' }} />
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
                                                background: isActive ? '#C8A84B18' : '#0a0a0a',
                                                border: `1px solid ${isActive ? '#C8A84B' : '#151515'}`,
                                                color: isActive ? '#C8A84B' : locked ? '#1a1a1a' : '#555',
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
                                            background: '#080808', border: '1px solid #1a1a1a', color: '#fff',
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
                                        <span style={{ position: 'absolute', right: '7px', top: '6px', fontSize: '8px', color: '#444' }}>...</span>
                                    )}
                                    {triggerResults.length > 0 && (
                                        <div style={{
                                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                                            background: '#0a0a0a', border: '1px solid #1a1a1a', borderTop: 'none',
                                            borderRadius: '0 0 3px 3px', boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
                                        }}>
                                            {triggerResults.slice(0, 5).map((r, i) => (
                                                <div
                                                    key={i}
                                                    onClick={() => fireTrigger(r.ticker)}
                                                    style={{
                                                        padding: '5px 7px', fontSize: '8px', cursor: 'pointer',
                                                        fontFamily: "'JetBrains Mono', monospace", color: '#666',
                                                        borderBottom: i < Math.min(triggerResults.length, 5) - 1 ? '1px solid #111' : 'none',
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.background = '#111'; e.currentTarget.style.color = '#fff'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#666'; }}
                                                >
                                                    <strong style={{ color: '#aaa' }}>{r.ticker}</strong>
                                                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '8px', color: '#333', marginLeft: '6px' }}>{r.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => triggerQuery.trim() && fireTrigger(triggerQuery.trim())}
                                    style={{
                                        background: '#0066FF15', border: '1px solid #0066FF50', color: '#0066FF',
                                        padding: '0 10px', fontSize: '9px', cursor: 'pointer',
                                        fontFamily: "'JetBrains Mono', monospace", borderRadius: '3px',
                                        transition: 'all 100ms', fontWeight: 700, letterSpacing: '0.04em'
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#0066FF30'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = '#0066FF15'; }}
                                >
                                    RUN
                                </button>
                            </div>

                            <div style={{ fontSize: '7px', color: '#222', letterSpacing: '0.06em', lineHeight: 1.5 }}>
                                Runs all 6 form types through the full pipeline. Results appear in the feed + Telegram.
                            </div>
                        </div>
                    )}
                </div>

                {/* Bottom — account */}
                <div style={{ borderTop: '1px solid #0a0a0a', padding: '12px 14px' }}>
                    <div style={{ fontSize: '10px', color: '#2a2a2a', letterSpacing: '0.08em', marginBottom: '2px' }}>
                        {user?.email?.split('@')[0] || '—'}
                    </div>
                    <div style={{
                        fontSize: '8px',
                        color: '#1e1e1e',
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
                            border: '1px solid #111',
                            color: '#2a2a2a',
                            fontSize: '9px',
                            letterSpacing: '0.1em',
                            cursor: 'pointer',
                            transition: 'all 150ms',
                            textAlign: 'center',
                            fontFamily: "'JetBrains Mono', monospace",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#FF333330'; e.currentTarget.style.color = '#FF3333'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#111'; e.currentTarget.style.color = '#2a2a2a'; }}
                    >
                        SIGN OUT
                    </button>
                </div>
            </div>

            {/* ── MAIN CONTENT ── */}
            <div style={{
                gridRow: '2',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
            }}>
                {children}
            </div>

        </div>
    );
}
