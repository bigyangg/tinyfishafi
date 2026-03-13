// Logs.jsx — Pipeline Execution Monitor
// Purpose: Professional financial-grade live pipeline log viewer with run history

import { useState, useEffect, useRef, useMemo } from 'react';
import AppShell from '../components/AppShell';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STEP_COLORS = {
    PIPELINE: '#4A90E2',
    AGENT: '#4A90E2',
    EDGAR: '#E8A838',
    TINYFISH: '#E87438',
    GEMINI: '#9B59B6',
    DEMO: '#9B59B6',
    NEWS: '#27AE60',
    GOVERNANCE: '#E74C3C',
    SCORING: '#E8A838',
    STORE: '#27AE60',
};

const LEVEL_COLORS = {
    error: '#E74C3C',
    warning: '#E8A838',
    success: '#27AE60',
    info: '#8E9299',
};

// Group flat entries by run session — a new session starts whenever we see
// a PIPELINE-level message containing "Processing" or "complete".
function groupIntoSessions(entries) {
    const sessions = [];
    let current = null;

    entries.forEach((entry) => {
        const isSessionBoundary =
            entry.step === 'PIPELINE' &&
            typeof entry.message === 'string' &&
            (entry.message.includes('Processing') || entry.message.startsWith('['));

        if (isSessionBoundary || current === null) {
            // Extract ticker from message like "[NVDA/8-K] ..."
            const tickerMatch = entry.message && entry.message.match(/^\[([A-Z]+)\//);
            const ticker = tickerMatch ? tickerMatch[1] : 'SYSTEM';
            current = {
                id: `session-${sessions.length}`,
                ticker,
                startTime: entry.time,
                entries: [],
                signals: 0,
                errors: 0,
            };
            sessions.push(current);
        }

        if (current) {
            current.entries.push(entry);
            if (entry.level === 'success') current.signals++;
            if (entry.level === 'error') current.errors++;
            current.endTime = entry.time;
        }
    });

    return sessions.reverse(); // newest first
}

export default function Logs() {
    const [entries, setEntries] = useState([]);
    const [connected, setConnected] = useState(false);
    const [selectedIdx, setSelectedIdx] = useState(0); // index into sessions
    const [paused, setPaused] = useState(false);
    const scrollRef = useRef(null);
    const pausedRef = useRef(false);

    pausedRef.current = paused;

    useEffect(() => {
        const es = new EventSource(`${API}/logs/stream`);

        es.onopen = () => setConnected(true);
        es.onerror = () => setConnected(false);
        es.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'ping') return;
                if (!pausedRef.current) {
                    setEntries(prev => [...prev.slice(-500), data]);
                }
            } catch { }
        };

        return () => es.close();
    }, []);

    const sessions = useMemo(() => groupIntoSessions(entries), [entries]);

    const activeSession = sessions[selectedIdx] ?? null;
    const activeEntries = activeSession ? activeSession.entries : entries;

    // Auto-select newest session when a new one appears
    useEffect(() => {
        setSelectedIdx(0);
    }, [sessions.length]);

    // Auto-scroll only when first / latest session is selected
    useEffect(() => {
        if (selectedIdx === 0 && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [activeEntries, selectedIdx]);

    const totalSignals = sessions.reduce((a, s) => a + s.signals, 0);
    const totalErrors = sessions.reduce((a, s) => a + s.errors, 0);

    return (
        <AppShell>
            <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                background: '#030303', fontFamily: "'JetBrains Mono', monospace", color: '#aaa',
            }}>

                {/* ── HEADER BAR ── */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0 20px', height: '44px',
                    borderBottom: '1px solid #111', background: '#070707', flexShrink: 0,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: '#fff' }}>
                            PIPELINE MONITOR
                        </span>
                        <div style={{ width: '1px', height: '16px', background: '#1e1e1e' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '10px' }}>
                            <div style={{
                                width: '5px', height: '5px', borderRadius: '50%',
                                background: connected ? '#27AE60' : '#E74C3C',
                                animation: connected ? 'pulse 2.5s ease-in-out infinite' : 'none',
                            }} />
                            <span style={{ color: connected ? '#27AE60' : '#E74C3C' }}>
                                {connected ? 'STREAM ACTIVE' : 'DISCONNECTED'}
                            </span>
                        </div>
                        <div style={{ width: '1px', height: '16px', background: '#1e1e1e' }} />
                        <span style={{ fontSize: '10px', color: '#555' }}>
                            {sessions.length} RUNS &nbsp;·&nbsp; {totalSignals} SIGNALS &nbsp;·&nbsp; {totalErrors} ERRORS
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                            onClick={() => setPaused(p => !p)}
                            style={{ ...hdrBtn, color: paused ? '#E8A838' : '#666' }}
                        >
                            {paused ? 'RESUME' : 'PAUSE'}
                        </button>
                        <button
                            onClick={() => { setEntries([]); setSelectedIdx(0); }}
                            style={{ ...hdrBtn, color: '#E74C3C' }}
                        >
                            CLEAR ALL
                        </button>
                    </div>
                </div>

                {/* ── SPLIT BODY ── */}
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                    {/* LEFT: RUN HISTORY */}
                    <div style={{
                        width: '200px', flexShrink: 0,
                        borderRight: '1px solid #111',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                        background: '#050505',
                    }}>
                        <div style={{
                            padding: '8px 12px 6px',
                            fontSize: '9px', fontWeight: 700, letterSpacing: '0.14em', color: '#444',
                            borderBottom: '1px solid #0e0e0e',
                        }}>
                            RUN HISTORY
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {sessions.length === 0 && (
                                <div style={{ padding: '20px 12px', fontSize: '10px', color: '#2a2a2a' }}>
                                    No runs yet.
                                </div>
                            )}
                            {sessions.map((session, idx) => {
                                const isActive = idx === selectedIdx;
                                const hasError = session.errors > 0;
                                return (
                                    <button
                                        key={session.id}
                                        onClick={() => setSelectedIdx(idx)}
                                        style={{
                                            display: 'block', width: '100%', textAlign: 'left',
                                            padding: '10px 12px',
                                            background: isActive ? '#0e0e0e' : 'transparent',
                                            border: 'none',
                                            borderLeft: isActive ? '2px solid #4A90E2' : '2px solid transparent',
                                            borderBottom: '1px solid #0a0a0a',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <div style={{
                                            fontSize: '11px', fontWeight: 700,
                                            color: isActive ? '#fff' : '#555',
                                            fontFamily: "'JetBrains Mono', monospace",
                                        }}>
                                            {session.ticker}
                                        </div>
                                        <div style={{ fontSize: '9px', color: '#333', marginTop: '3px' }}>
                                            {session.startTime}
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', marginTop: '5px', fontSize: '9px' }}>
                                            <span style={{ color: '#27AE60' }}>{session.signals}S</span>
                                            {hasError && <span style={{ color: '#E74C3C' }}>{session.errors}E</span>}
                                            <span style={{ color: '#333' }}>{session.entries.length}L</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* RIGHT: LOG VIEWER */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                        {/* Column headers */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '72px 90px 60px 1fr',
                            gap: '0', padding: '7px 16px',
                            borderBottom: '1px solid #111',
                            fontSize: '8px', fontWeight: 700, letterSpacing: '0.12em', color: '#2e2e2e',
                            background: '#060606', flexShrink: 0,
                        }}>
                            <span>TIME</span>
                            <span>MODULE</span>
                            <span>STATUS</span>
                            <span>MESSAGE</span>
                        </div>

                        {/* Log rows */}
                        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>
                            {activeEntries.length === 0 && (
                                <div style={{ padding: '40px 24px', color: '#2a2a2a', fontSize: '11px', lineHeight: 1.8 }}>
                                    <div style={{ color: '#444' }}>SYSTEM_READY</div>
                                    <div>Listening for pipeline events...</div>
                                    <div>Use the Signal Trigger in the sidebar to start a sweep.</div>
                                </div>
                            )}
                            {activeEntries.map((entry, idx) => {
                                const stepColor = STEP_COLORS[entry.step] || '#555';
                                const levelColor = LEVEL_COLORS[entry.level] || '#555';

                                return (
                                    <div
                                        key={idx}
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: '72px 90px 60px 1fr',
                                            gap: '0', padding: '5px 16px',
                                            borderBottom: '1px solid #080808',
                                            fontSize: '11px', alignItems: 'start',
                                            background: idx % 2 === 0 ? 'transparent' : '#050505',
                                        }}
                                    >
                                        <span style={{ color: '#2e2e2e', paddingTop: '1px' }}>{entry.time}</span>
                                        <span style={{ color: stepColor, fontWeight: 600 }}>{entry.step}</span>
                                        <span style={{ color: levelColor, fontSize: '9px', paddingTop: '1px', letterSpacing: '0.05em' }}>
                                            {(entry.level || 'info').toUpperCase()}
                                        </span>
                                        <span style={{ color: '#9a9a9a', wordBreak: 'break-word' }}>
                                            {entry.message}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50%       { opacity: 0.3; }
                }
            `}</style>
        </AppShell>
    );
}

const hdrBtn = {
    background: 'transparent',
    border: '1px solid #1a1a1a',
    color: '#555',
    padding: '4px 10px',
    fontSize: '9px',
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.08em',
};
