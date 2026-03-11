// AppShell.jsx — Shared layout shell for all private pages
// Provides consistent sidebar nav + top status bar chrome
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

    const navItems = [
        { to: '/dashboard', label: 'FEED', icon: '◈' },
        { to: '/watchlist', label: 'WATCHLIST', icon: '◎' },
        { to: '/settings', label: 'SETTINGS', icon: '⊙' },
    ];

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: '180px 1fr',
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
                <nav style={{ padding: '8px 0', flex: 1 }}>
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
