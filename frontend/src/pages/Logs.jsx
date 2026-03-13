// Logs.jsx — Live Pipeline Log Viewer (SSE Stream)
// Purpose: Real-time log viewer showing pipeline steps as they happen
// Only visible in demo mode (?demo=true)

import { useState, useEffect, useRef } from 'react';
import AppShell from '../components/AppShell';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STEP_COLORS = {
    PIPELINE: '#0066FF',
    AGENT: '#0066FF',
    EDGAR: '#FFB300',
    TINYFISH: '#FF6B00',
    GEMINI: '#A855F7',
    NEWS: '#00C805',
    GOVERNANCE: '#FF3333',
    SCORING: '#FFB300',
    STORE: '#00C805',
};

export default function Logs() {
    const [entries, setEntries] = useState([]);
    const [connected, setConnected] = useState(false);
    const scrollRef = useRef(null);
    const eventSourceRef = useRef(null);

    useEffect(() => {
        const es = new EventSource(`${API}/logs/stream`);
        eventSourceRef.current = es;

        es.onopen = () => setConnected(true);
        es.onerror = () => setConnected(false);
        es.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'ping') return;
                setEntries(prev => [...prev.slice(-200), data]);
            } catch { }
        };

        return () => es.close();
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [entries]);

    return (
        <AppShell>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* Header */}
                <div style={{
                    padding: '16px 24px',
                    borderBottom: '1px solid #0d0d0d',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', color: '#fff' }}>
                            LIVE PIPELINE LOG
                        </span>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '3px 8px',
                            borderRadius: '10px',
                            background: connected ? '#00C80510' : '#FF333310',
                            border: `1px solid ${connected ? '#00C80530' : '#FF333330'}`,
                        }}>
                            <div style={{
                                width: '5px', height: '5px', borderRadius: '50%',
                                background: connected ? '#00C805' : '#FF3333',
                                animation: connected ? 'livePulse 2s ease-in-out infinite' : 'none',
                            }} />
                            <span style={{
                                fontSize: '8px',
                                color: connected ? '#00C80599' : '#FF333399',
                                letterSpacing: '0.1em',
                            }}>
                                {connected ? 'STREAMING' : 'DISCONNECTED'}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={() => setEntries([])}
                        style={{
                            background: 'none', border: '1px solid #111', color: '#333',
                            padding: '4px 10px', fontSize: '9px', cursor: 'pointer',
                            letterSpacing: '0.08em', fontFamily: "'JetBrains Mono', monospace",
                        }}
                    >
                        CLEAR
                    </button>
                </div>

                {/* Log entries */}
                <div
                    ref={scrollRef}
                    style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '8px 0',
                        fontFamily: "'JetBrains Mono', monospace",
                    }}
                >
                    {entries.length === 0 && (
                        <div style={{ padding: '40px', textAlign: 'center' }}>
                            <p style={{ fontSize: '11px', color: '#222', letterSpacing: '0.08em' }}>
                                Waiting for pipeline events...
                            </p>
                            <p style={{ fontSize: '10px', color: '#1a1a1a', marginTop: '8px' }}>
                                Use the Signal Trigger in the sidebar to run a pipeline sweep
                            </p>
                        </div>
                    )}

                    {entries.map((entry, idx) => {
                        const stepColor = STEP_COLORS[entry.step] || '#555';
                        const levelColor = entry.level === 'error' ? '#FF3333'
                            : entry.level === 'warning' ? '#FFB300'
                                : entry.level === 'success' ? '#00C805' : '#555';

                        return (
                            <div key={idx} style={{
                                display: 'grid',
                                gridTemplateColumns: '60px 90px 1fr',
                                gap: '12px',
                                padding: '6px 24px',
                                borderBottom: '1px solid #080808',
                                alignItems: 'center',
                                animation: 'fadeIn 200ms ease',
                            }}>
                                <span style={{ fontSize: '10px', color: '#1e1e1e' }}>
                                    {entry.time}
                                </span>
                                <span style={{
                                    fontSize: '9px',
                                    padding: '2px 6px',
                                    background: `${stepColor}12`,
                                    border: `1px solid ${stepColor}30`,
                                    color: stepColor,
                                    letterSpacing: '0.06em',
                                    textAlign: 'center',
                                }}>
                                    {entry.step}
                                </span>
                                <span style={{ fontSize: '11px', color: levelColor }}>
                                    {entry.message}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            <style>{`
                @keyframes livePulse {
                    0%, 100% { opacity: 1; box-shadow: 0 0 0 0 #00C80540; }
                    50%       { opacity: 0.7; box-shadow: 0 0 0 5px #00C80508; }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-4px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </AppShell>
    );
}
