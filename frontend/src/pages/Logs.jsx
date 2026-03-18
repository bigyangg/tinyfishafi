// Logs.jsx — Pipeline Execution Monitor
// Professional two-panel layout: run history + live log stream grouped by run_id

import { useState, useEffect, useRef, useMemo } from 'react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MODULE_COLORS = {
    PIPELINE: '#5B9BD5',
    AGENT: '#5B9BD5',
    EDGAR: '#C8A84B',
    TINYFISH: '#D4785A',
    GEMINI: '#9A7EC8',
    SYSTEM: '#7EC89A',
    NEWS: '#5BC8A0',
    GOVERNANCE: '#C85B5B',
    SCORING: '#C8A84B',
    STORE: '#5BC88A',
};

const LEVEL_DOT = { error: '#C85B5B', warning: '#C8A84B', success: '#5BC88A', info: '#3a3a3a' };
const LEVEL_TEXT = { error: '#C85B5B', warning: '#C8A84B', success: '#5BC88A', info: '#666' };

export default function Logs() {
    // runs: Map of run_id -> { id, ticker, startTime, entries[], signals, errors, complete }
    const [runs, setRuns] = useState(new Map());
    const [orphanEntries, setOrphanEntries] = useState([]); // entries with no run_id
    const [selectedRunId, setSelectedRunId] = useState(null);
    const [connected, setConnected] = useState(true); // Optimistic UI prevents red flicker on load
    const scrollRef = useRef(null);
    const latestRunId = useRef(null);

    // Fetch historical runs on mount
    useEffect(() => {
        fetch(`${API}/logs/history`)
            .then(res => res.json())
            .then(data => {
                if (data.runs && Array.isArray(data.runs)) {
                    setRuns(prev => {
                        const next = new Map(prev);
                        data.runs.forEach(r => next.set(r.id, r));
                        return next;
                    });
                    // Auto-select the requested run from URL, or fallback to newest completed
                    const urlParams = new URLSearchParams(window.location.search);
                    const targetRunId = urlParams.get('run');

                    if (targetRunId && next.has(targetRunId)) {
                        latestRunId.current = targetRunId;
                        setSelectedRunId(targetRunId);
                    } else if (data.runs.length > 0) {
                        const sorted = [...data.runs].sort((a, b) => b.startTime > a.startTime ? 1 : -1);
                        latestRunId.current = sorted[0].id;
                        setSelectedRunId(prev => prev === null ? sorted[0].id : prev);
                    }
                }
            })
            .catch(err => console.error("Failed to fetch log history:", err));
    }, []);

    useEffect(() => {
        const es = new EventSource(`${API}/logs/stream`);
        es.onopen = () => setConnected(true);
        es.onerror = () => setConnected(false);
        es.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'ping') return;

                const rid = data.run_id;
                if (!rid) {
                    setOrphanEntries(prev => [...prev.slice(-100), data]);
                    return;
                }

                setRuns(prev => {
                    const next = new Map(prev);
                    const existing = next.get(rid) || {
                        id: rid,
                        ticker: extractTicker(data.message),
                        startTime: data.time,
                        entries: [],
                        signals: 0,
                        errors: 0,
                        complete: false,
                    };

                    const isComplete =
                        data.level === 'success' &&
                        typeof data.message === 'string' &&
                        data.message.includes('All done');

                    const newEntry = { ...existing };
                    newEntry.entries = [...existing.entries, data].slice(-300);
                    if (data.level === 'success') newEntry.signals = existing.signals + 1;
                    if (data.level === 'error') newEntry.errors = existing.errors + 1;
                    if (isComplete) newEntry.complete = true;
                    newEntry.endTime = data.time;

                    next.set(rid, newEntry);

                    // Auto-select the newest run
                    if (!latestRunId.current || latestRunId.current !== rid) {
                        latestRunId.current = rid;
                        // Use a ref trick to set state from within a setState callback
                    }
                    return next;
                });

                // Auto-select newest run in a separate effect
                setSelectedRunId(prev => prev === null ? rid : prev);
                // Whenever a new run_id shows up, select it
                if (latestRunId.current !== rid) {
                    latestRunId.current = rid;
                    setSelectedRunId(rid);
                }

            } catch { }
        };
        return () => es.close();
    }, []);

    // Sorted runs: newest first by startTime
    const sortedRuns = useMemo(() => {
        return [...runs.values()].sort((a, b) => {
            return b.startTime > a.startTime ? 1 : -1;
        });
    }, [runs]);

    const activeRun = selectedRunId ? runs.get(selectedRunId) : null;
    const activeEntries = activeRun ? activeRun.entries : orphanEntries;

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [activeEntries]);

    const totalRuns = sortedRuns.length;
    const totalSignals = sortedRuns.reduce((a, r) => a + r.signals, 0);
    const totalErrors = sortedRuns.reduce((a, r) => a + r.errors, 0);

    return (
        <>
        <div style={shell}>

                {/* ── TOP HEADER ── */}
                <div style={header}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', color: '#d0d0d0' }}>
                            EXECUTION MONITOR
                        </span>
                        <div style={divider} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{
                                width: '5px', height: '5px', borderRadius: '50%',
                                background: connected ? '#5BC88A' : '#C85B5B',
                                animation: connected ? 'pulse 2s ease-in-out infinite' : 'none',
                            }} />
                            <span style={{ fontSize: '10px', color: connected ? '#5BC88A' : '#C85B5B', letterSpacing: '0.08em' }}>
                                {connected ? 'STREAM ACTIVE' : 'DISCONNECTED'}
                            </span>
                        </div>
                        <div style={divider} />
                        <span style={{ fontSize: '10px', color: '#555', letterSpacing: '0.06em' }}>
                            {totalRuns} RUNS &nbsp;&nbsp; {totalSignals} SIGNALS &nbsp;&nbsp; {totalErrors} ERRORS
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                            onClick={() => { setRuns(new Map()); setOrphanEntries([]); setSelectedRunId(null); latestRunId.current = null; }}
                            style={hdrBtn}
                        >
                            CLEAR HISTORY
                        </button>
                    </div>
                </div>

                {/* ── BODY ── */}
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                    {/* LEFT: RUN HISTORY PANEL */}
                    <div style={historyPanel}>
                        <div style={panelLabel}>RUN HISTORY</div>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {sortedRuns.length === 0 ? (
                                <div style={{ padding: '16px 12px', fontSize: '10px', color: '#2e2e2e', lineHeight: 2 }}>
                                    <div>No runs yet.</div>
                                    <div style={{ color: '#222' }}>Use the Signal Trigger to start a sweep.</div>
                                </div>
                            ) : sortedRuns.map(run => {
                                const isActive = run.id === selectedRunId;
                                // Parse signal outcomes from success log messages like "[COIN/8-K] Positive (conf 80) ..."
                                const outcomes = run.entries
                                    .filter(e => e.level === 'success' && e.step === 'PIPELINE' && e.message?.includes('conf '))
                                    .map(e => {
                                        const m = e.message?.match(/\[(?:[A-Z]+)\/([^\]]+)\]\s+(\w+)\s+\(conf\s+(\d+)/);
                                        if (!m) return null;
                                        return { form: m[1], signal: m[2], conf: parseInt(m[3]) };
                                    }).filter(Boolean);

                                const SIG_COLOR = { Positive: '#5BC88A', Neutral: '#888', Risk: '#C85B5B' };

                                return (
                                    <button
                                        key={run.id}
                                        onClick={() => setSelectedRunId(run.id)}
                                        style={{
                                            ...runCard,
                                            background: isActive ? '#0c1520' : 'transparent',
                                            borderLeft: `2px solid ${isActive ? '#5B9BD5' : 'transparent'}`,
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{
                                                fontSize: '12px', fontWeight: 700,
                                                color: isActive ? '#d0d0d0' : '#555',
                                                letterSpacing: '0.06em',
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                paddingRight: '8px'
                                            }}>
                                                {run.ticker}
                                            </span>
                                            <span style={{
                                                fontSize: '8px', padding: '1px 5px', letterSpacing: '0.1em',
                                                color: run.complete ? '#5BC88A' : '#C8A84B',
                                                border: `1px solid ${run.complete ? '#5BC88A30' : '#C8A84B30'}`,
                                                flexShrink: 0,
                                            }}>
                                                {run.complete ? 'DONE' : 'RUNNING'}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '9px', color: '#2e2e2e', marginTop: '4px', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {run.startTime.substring(11, 19)}{run.endTime && run.endTime !== run.startTime ? ` — ${run.endTime.substring(11, 19)}` : ''}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '5px', fontSize: '9px' }}>
                                            <span style={{ color: '#5BC88A' }}>{run.signals} SIG</span>
                                            <span style={{ color: run.errors > 0 ? '#C85B5B' : '#252525' }}>{run.errors} ERR</span>
                                            <span style={{ color: '#252525' }}>{run.entries.length}L</span>
                                        </div>
                                        {/* Per-form signal outcomes */}
                                        {outcomes.length > 0 && (
                                            <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                {outcomes.map((o, i) => (
                                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
                                                        <span style={{ color: '#333' }}>{o.form}</span>
                                                        <span style={{ color: SIG_COLOR[o.signal] || '#888' }}>{o.signal} {o.conf}%</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <div style={{ marginTop: '5px', fontSize: '8px', color: '#151515', letterSpacing: '0.06em' }}>
                                            #{run.id}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* RIGHT: LOG VIEWER */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                        {/* Run context banner */}
                        {activeRun && (
                            <div style={contextBanner}>
                                <span style={{ color: '#aaa', fontSize: '10px', fontWeight: 700 }}>{activeRun.ticker}</span>
                                <span style={{ color: '#333', fontSize: '10px' }}>run #{activeRun.id}</span>
                                <span style={{ color: '#444', fontSize: '10px' }}>{activeRun.startTime} UTC</span>
                                <span style={{ color: '#555', fontSize: '10px' }}>{activeRun.entries.length} log lines</span>
                            </div>
                        )}

                        {/* Column headers */}
                        <div style={colHeaders}>
                            <span style={{ width: '70px' }}>TIME</span>
                            <span style={{ width: '96px' }}>MODULE</span>
                            <span style={{ width: '52px' }}>LVL</span>
                            <span style={{ flex: 1 }}>MESSAGE</span>
                        </div>

                        {/* Log rows */}
                        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>
                            {activeEntries.length === 0 && (
                                <div style={{ padding: '40px 20px', color: '#252525', fontSize: '11px', lineHeight: 2, fontFamily: 'monospace' }}>
                                    <div style={{ color: '#333' }}>SYSTEM_READY — Listening for pipeline events.</div>
                                    <div>Trigger a sweep from the sidebar to begin a new run.</div>
                                </div>
                            )}
                            {activeEntries.map((entry, idx) => {
                                const modColor = MODULE_COLORS[entry.step] || '#444';
                                const lvlColor = LEVEL_TEXT[entry.level] || '#444';
                                const lvlDot = LEVEL_DOT[entry.level] || '#333';

                                return (
                                    <div
                                        key={idx}
                                        style={{
                                            display: 'flex', gap: '0',
                                            padding: '4px 16px',
                                            borderBottom: '1px solid #080808',
                                            fontSize: '11px', alignItems: 'flex-start',
                                            background: idx % 2 === 0 ? 'transparent' : '#040404',
                                        }}
                                    >
                                        <span style={{ width: '70px', color: '#2e2e2e', flexShrink: 0, fontFamily: 'monospace', paddingTop: '1px' }}>
                                            {entry.time}
                                        </span>
                                        <span style={{ width: '96px', color: modColor, fontWeight: 600, flexShrink: 0, letterSpacing: '0.04em', fontFamily: 'monospace' }}>
                                            {entry.step}
                                        </span>
                                        <span style={{ width: '52px', flexShrink: 0 }}>
                                            <span style={{
                                                display: 'inline-block', width: '5px', height: '5px',
                                                borderRadius: '50%', background: lvlDot,
                                                marginRight: '5px', marginTop: '4px', verticalAlign: 'top',
                                            }} />
                                            <span style={{ fontSize: '9px', color: lvlColor, letterSpacing: '0.06em', verticalAlign: 'top' }}>
                                                {(entry.level || 'info').toUpperCase().slice(0, 4)}
                                            </span>
                                        </span>
                                        <span style={{ flex: 1, color: '#888', wordBreak: 'break-word', lineHeight: 1.5 }}>
                                            {entry.message}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <style>{`
                        @keyframes pulse {
                            0%, 100% { opacity: 1; }
                            50%       { opacity: 0.2; }
                        }
                        *::-webkit-scrollbar { width: 4px; }
                        *::-webkit-scrollbar-track { background: transparent; }
                        *::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 2px; }
                    `}</style>
                </div>
            </div>
        </>
    );
}

function extractTicker(message) {
    if (!message) return 'SYS';
    // [NVDA/8-K] or "Smart trigger started for NVDA"
    const m1 = message.match(/\[([A-Z]+)\//);
    if (m1) return m1[1];
    const m2 = message.match(/started for ([A-Z]+)/);
    if (m2) return m2[1];
    return 'SYS';
}

// ── Styles ──
const mono = "'JetBrains Mono', 'Fira Mono', monospace";

const shell = {
    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    background: '#020202', fontFamily: mono, color: '#888',
};

const header = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', height: '40px', flexShrink: 0,
    borderBottom: '1px solid #0f0f0f', background: '#060606',
};

const divider = {
    width: '1px', height: '14px', background: '#1a1a1a', margin: '0 16px',
};

const historyPanel = {
    width: '260px', flexShrink: 0, borderRight: '1px solid #0f0f0f',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    background: '#040404',
};

const panelLabel = {
    padding: '8px 12px 7px', fontSize: '8px', fontWeight: 700,
    letterSpacing: '0.15em', color: '#2e2e2e',
    borderBottom: '1px solid #0c0c0c', background: '#040404', flexShrink: 0,
};

const runCard = {
    display: 'block', width: '100%', textAlign: 'left',
    padding: '10px 12px', border: 'none',
    borderLeft: '2px solid transparent',
    borderBottom: '1px solid #0a0a0a',
    cursor: 'pointer', fontFamily: mono,
};

const contextBanner = {
    display: 'flex', gap: '20px', alignItems: 'center',
    padding: '6px 16px', borderBottom: '1px solid #0c0c0c',
    background: '#060606', flexShrink: 0,
};

const colHeaders = {
    display: 'flex', gap: '0',
    padding: '6px 16px', borderBottom: '1px solid #0f0f0f',
    fontSize: '8px', fontWeight: 700, letterSpacing: '0.14em', color: '#252525',
    background: '#050505', flexShrink: 0,
};

const hdrBtn = {
    background: 'transparent', border: '1px solid #111',
    color: '#444', padding: '3px 10px', fontSize: '9px',
    cursor: 'pointer', fontFamily: mono, letterSpacing: '0.08em',
};
