import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Runs() {
    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchRuns = async () => {
            try {
                const r = await fetch(`${API}/logs/history`);
                if (r.ok) {
                    const data = await r.json();
                    if (data.runs && Array.isArray(data.runs) && data.runs.length > 0) {
                        setRuns(data.runs.sort((a, b) => b.startTime > a.startTime ? 1 : -1));
                        return;
                    }
                }
                // Fallback: build run history from stored signals
                const r2 = await fetch(`${API}/signals?limit=200`);
                if (r2.ok) {
                    const sigData = await r2.json();
                    const sigs = Array.isArray(sigData) ? sigData : (sigData?.signals || []);
                    const grouped = groupSignalsIntoRuns(sigs);
                    setRuns(grouped);
                }
            } catch (err) {
                console.error('Runs fetch failed:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchRuns();
    }, []);

    function groupSignalsIntoRuns(signals) {
        if (!signals?.length) return [];
        const sorted = [...signals].sort(
            (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );
        const runs = [];
        let currentRun = null;
        sorted.forEach(sig => {
            const sigTime = new Date(sig.created_at).getTime();
            if (!currentRun || sigTime < currentRun.startTime - 300000) {
                currentRun = {
                    id: sig.id,
                    ticker: sig.ticker || 'SYS',
                    startTime: sig.created_at,
                    endTime: sig.created_at,
                    startTimeMs: sigTime,
                    signals: 0,
                    errors: 0,
                    complete: true,
                    entries: [],
                    _sigs: [sig],
                };
                runs.push(currentRun);
            } else {
                currentRun._sigs.push(sig);
                if (sig.created_at < currentRun.endTime) {
                    currentRun.endTime = sig.created_at;
                }
            }
        });
        return runs.map(r => ({
            ...r,
            signals: r._sigs.length,
            entries: r._sigs.map(s => ({
                time: new Date(s.created_at).toISOString().substring(11, 19),
                step: 'PIPELINE',
                level: s.signal === 'Risk' ? 'warning' : s.signal === 'Positive' ? 'success' : 'info',
                message: `[${s.ticker}/${s.filing_type || '?'}] ${s.signal} (conf ${s.confidence}) — ${(s.summary || '').slice(0, 80)}`,
            })),
        }));
    }

    const SIG_COLOR = { Positive: '#00C805', Neutral: '#888', Risk: '#FF3333' };

    return (
        <>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#020202', overflow: 'hidden' }}>

                {/* ── HEADER ── */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0 24px', height: '60px', flexShrink: 0,
                    borderBottom: '1px solid #111', background: '#060606',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#fff', letterSpacing: '0.12em', fontFamily: "'JetBrains Mono', monospace" }}>
                            PIPELINE SWEEPS
                        </h1>
                        <div style={{ width: '1px', height: '16px', background: '#222' }} />
                        <span style={{ fontSize: '11px', color: '#555', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono', monospace" }}>
                            {runs.length} RECENT RUNS
                        </span>
                    </div>
                </div>

                {/* ── BODY ── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                    {loading ? (
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} style={{ width: '300px', height: '200px', background: '#0a0a0a', border: '1px solid #111', animation: 'sk 1.5s ease infinite' }} />
                            ))}
                        </div>
                    ) : runs.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '100px 20px' }}>
                            <p style={{ fontSize: '12px', color: '#333', letterSpacing: '0.1em', fontFamily: "'JetBrains Mono', monospace" }}>NO RUN HISTORY</p>
                            <p style={{ fontSize: '11px', color: '#222', marginTop: '8px' }}>Use the Signal Trigger to start a sweep analysis.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                            {runs.map(run => {
                                // Extract processed signals directly from log messages to display in the card
                                const outcomes = run.entries
                                    .filter(e => e.level === 'success' && e.step === 'PIPELINE' && e.message?.includes('conf '))
                                    .map(e => {
                                        const m = e.message?.match(/\[(?:[A-Z]+)\/([^\]]+)\]\s+(\w+)\s+\(conf\s+(\d+).*?(?:— (.*))?/);
                                        if (!m) return null;
                                        return { form: m[1], signal: m[2], conf: parseInt(m[3]), summary: m[4] || '' };
                                    }).filter(Boolean);

                                const isRunning = !run.complete;

                                return (
                                    <div
                                        key={run.id}
                                        style={{
                                            background: '#060606', border: '1px solid #141414',
                                            borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
                                            transition: 'border-color 150ms', position: 'relative'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.borderColor = '#333'}
                                        onMouseLeave={e => e.currentTarget.style.borderColor = '#141414'}
                                    >
                                        {/* Top Bar Indicator */}
                                        <div style={{ height: '3px', width: '100%', background: isRunning ? '#C8A84B' : (run.errors > 0 ? '#FF3333' : '#00C805') }} />

                                        {/* Card Header */}
                                        <div style={{ padding: '16px', borderBottom: '1px solid #0d0d0d', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#fff', letterSpacing: '0.08em', fontFamily: "'JetBrains Mono', monospace" }}>
                                                        {run.ticker}
                                                    </span>
                                                    <span style={{ fontSize: '9px', color: '#444', fontFamily: "'JetBrains Mono', monospace" }}>
                                                        #{run.id.split('-')[0]}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '10px', color: '#666', marginTop: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                                                    {run.startTime.substring(11, 19)} {run.endTime && run.endTime !== run.startTime ? `— ${run.endTime.substring(11, 19)}` : ''}
                                                </div>
                                            </div>
                                            <div>
                                                <span style={{
                                                    fontSize: '9px', padding: '3px 6px', letterSpacing: '0.1em', fontFamily: "'JetBrains Mono', monospace", borderRadius: '2px',
                                                    color: isRunning ? '#C8A84B' : '#00C805',
                                                    background: isRunning ? '#C8A84B15' : '#00C80515',
                                                }}>
                                                    {isRunning ? 'RUNNING' : 'COMPLETE'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Stats Row */}
                                        <div style={{ display: 'flex', padding: '12px 16px', background: '#0a0a0a', borderBottom: '1px solid #0d0d0d', gap: '20px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '14px', fontWeight: 700, color: '#00C805', fontFamily: "'JetBrains Mono', monospace" }}>{run.signals}</span>
                                                <span style={{ fontSize: '8px', color: '#555', letterSpacing: '0.1em' }}>SIGNALS</span>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '14px', fontWeight: 700, color: run.errors > 0 ? '#FF3333' : '#333', fontFamily: "'JetBrains Mono', monospace" }}>{run.errors}</span>
                                                <span style={{ fontSize: '8px', color: '#555', letterSpacing: '0.1em' }}>ERRORS</span>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '14px', fontWeight: 700, color: '#666', fontFamily: "'JetBrains Mono', monospace" }}>{run.entries.length}</span>
                                                <span style={{ fontSize: '8px', color: '#555', letterSpacing: '0.1em' }}>LOG LINES</span>
                                            </div>
                                        </div>

                                        {/* Extracted Outcomes */}
                                        <div style={{ padding: '16px', flex: 1 }}>
                                            {outcomes.length > 0 ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                    {outcomes.map((o, i) => (
                                                        <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                                            <div style={{
                                                                fontSize: '9px', color: SIG_COLOR[o.signal] || '#888',
                                                                width: '60px', flexShrink: 0, marginTop: '2px',
                                                                fontFamily: "'JetBrains Mono', monospace",
                                                                fontWeight: 700
                                                            }}>
                                                                {o.signal}
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <span style={{ fontSize: '10px', color: '#ddd', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                                                                        {o.form}
                                                                    </span>
                                                                    <span style={{ fontSize: '9px', color: '#555', fontFamily: "'JetBrains Mono', monospace" }}>
                                                                        {o.conf}% conf
                                                                    </span>
                                                                </div>
                                                                <span style={{ fontSize: '11px', color: '#555', lineHeight: 1.4, WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                                    {o.summary}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '11px', color: '#333', fontStyle: 'italic' }}>
                                                    {isRunning ? 'Processing filings...' : 'No actionable intelligence extracted.'}
                                                </div>
                                            )}
                                        </div>

                                        {/* Footer Action */}
                                        <div style={{ padding: '12px 16px', borderTop: '1px solid #0d0d0d', display: 'flex', justifyContent: 'flex-end', background: '#080808' }}>
                                            <button
                                                onClick={() => navigate(`/logs?run=${run.id}`)}
                                                style={{
                                                    background: 'transparent', border: '1px solid #1a1a1a', padding: '6px 12px',
                                                    color: '#0066FF', fontSize: '9px', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
                                                    letterSpacing: '0.08em', borderRadius: '3px', transition: 'all 150ms'
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.borderColor = '#0066FF40'; e.currentTarget.style.background = '#0066FF05'; }}
                                                onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a1a1a'; e.currentTarget.style.background = 'transparent'; }}
                                            >
                                                VIEW RAW TRACE ↗
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <style>{`
                        @keyframes sk {
                            0%, 100% { opacity: 1; }
                            50% { opacity: 0.3; }
                        }
                    `}</style>
                </div>
            </div>
        </>
    );
}
