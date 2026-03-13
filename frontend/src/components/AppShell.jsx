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
    const [backendOnline, setBackendOnline] = useState(null);
    const [countdown, setCountdown] = useState(null);
    const countdownRef = useRef(null);

    // Signal Trigger state
    const [triggerQuery, setTriggerQuery] = useState('');
    const [triggerResults, setTriggerResults] = useState([]);
    const [triggerSearching, setTriggerSearching] = useState(false);
    const [triggerOpen, setTriggerOpen] = useState(true);

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
    const fireTrigger = async (ticker) => {
        try {
            await axios.post(`${API}/demo/trigger-all`, { ticker });
            setTriggerQuery('');
            setTriggerResults([]);
        } catch (err) {
            console.error('Signal trigger failed:', err);
        }
    };

    const navItems = [
        { to: '/dashboard', label: 'FEED', icon: '◈' },
        { to: '/watchlist', label: 'WATCHLIST', icon: '◎' },
        { to: '/logs', label: 'PIPELINE', icon: '⊡' },
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
                borderBottom: '1px solid #0f0f0f',
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px',
                gap: '20px',
                background: '#050505',
            }}>
                {/* Agent dot */}
                <div style={{
                    width: '5px', height: '5px',
                    borderRadius: '50%',
                    background: agentStatus === 'running' ? '#00C805' : '#FF3333',
                    animation: agentStatus === 'running' ? 'pulse-green 3s ease-in-out infinite' : 'none',
                }} />
                <span style={{ fontSize: '10px', color: '#2a2a2a', letterSpacing: '0.1em' }}>
                    {agentStatus === 'running' ? 'MONITORING SEC EDGAR' : 'AGENT OFFLINE'}
                </span>

                {/* Countdown */}
                {countdown != null && countdown > 0 && (
                    <span style={{ fontSize: '10px', color: '#1a1a1a', letterSpacing: '0.06em' }}>
                        NEXT: {countdown}s
                    </span>
                )}

                {/* Filed today */}
                {filedToday > 0 && (
                    <span style={{ fontSize: '10px', color: '#1a1a1a' }}>
                        {filedToday} today
                    </span>
                )}

                <div style={{ flex: 1 }} />

                {/* Backend indicator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                        width: '4px', height: '4px',
                        borderRadius: '50%',
                        background: backendOnline === true ? '#00C805' : backendOnline === false ? '#FF3333' : '#333',
                    }} />
                    <span style={{ fontSize: '9px', color: '#1e1e1e', letterSpacing: '0.08em' }}>
                        {backendOnline === true ? 'ONLINE' : backendOnline === false ? 'OFFLINE' : '···'}
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
                            {/* Quick-fire buttons */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
                                {['TSLA', 'NVDA', 'AAPL', 'MSFT', 'AMZN', 'COIN'].map(t => (
                                    <button
                                        key={t}
                                        onClick={async (e) => {
                                            const btn = e.currentTarget;
                                            btn.style.background = '#0066FF15';
                                            btn.style.borderColor = '#0066FF';
                                            btn.style.color = '#0066FF';
                                            btn.textContent = '...';
                                            try {
                                                const res = await axios.post(`${API}/demo/trigger-all`, { ticker: t });
                                                const forms = res.data?.forms_found?.length || 0;
                                                btn.textContent = `${forms}`;
                                                btn.style.color = '#00C805';
                                                btn.style.borderColor = '#00C80540';
                                                setTimeout(() => {
                                                    btn.textContent = t;
                                                    btn.style.background = '#111';
                                                    btn.style.borderColor = '#1a1a1a';
                                                    btn.style.color = '#555';
                                                }, 4000);
                                            } catch {
                                                btn.textContent = '!';
                                                btn.style.color = '#FF3333';
                                            }
                                        }}
                                        style={{
                                            background: '#111', border: '1px solid #1a1a1a', color: '#555',
                                            padding: '5px 0', fontSize: '9px', cursor: 'pointer',
                                            letterSpacing: '0.04em', fontFamily: "'JetBrains Mono', monospace",
                                            transition: 'all 100ms', textAlign: 'center', borderRadius: '3px',
                                        }}
                                        onMouseEnter={e => { if (e.currentTarget.style.color === 'rgb(85, 85, 85)') { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#aaa'; } }}
                                        onMouseLeave={e => { if (e.currentTarget.style.color === 'rgb(170, 170, 170)') { e.currentTarget.style.borderColor = '#1a1a1a'; e.currentTarget.style.color = '#555'; } }}
                                    >
                                        {t}
                                    </button>
                                ))}
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
                                Runs all 5 form types through the full pipeline. Results appear in the feed + Telegram.
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
