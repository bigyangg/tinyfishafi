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
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#030303', color: '#c0c0c0', fontFamily: "'JetBrains Mono', monospace" }}>

                {/* ── TOP HEADER ── */}
                <div style={{
                    padding: '12px 20px',
                    borderBottom: '1px solid #1a1a1a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#080808'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.05em', color: '#fff' }}>
                            PIPELINE / LIVE_STREAM
                        </span>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '11px',
                            color: connected ? '#00C805' : '#FF3333',
                            borderLeft: '1px solid #333',
                            paddingLeft: '16px'
                        }}>
                            <span style={{ animation: connected ? 'pulse 2s infinite' : 'none' }}>●</span>
                            <span>{connected ? 'CONNECTED: wss://afi.system/stream' : 'CONNECTION_LOST: Retrying...'}</span>
                        </div>
                    </div>
                </div>

                {/* ── SUB-TOOLBAR ── */}
                <div style={{
                    padding: '8px 20px',
                    borderBottom: '1px solid #111',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#050505',
                    fontSize: '10px'
                }}>
                    <div style={{ display: 'flex', gap: '20px', color: '#666' }}>
                        <span>SYSTEM: ONLINE</span>
                        <span>LATENCY: 12ms</span>
                        <span>SESSIONS: 1</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button style={btnStyle}>PAUSE STREAM</button>
                        <button style={btnStyle}>EXPORT .LOG</button>
                        <button onClick={() => setEntries([])} style={{ ...btnStyle, color: '#FF3333' }}>[X] PURGE</button>
                    </div>
                </div>

                {/* ── TABLE HEADERS ── */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 100px 70px 1fr',
                    gap: '16px',
                    padding: '8px 20px',
                    borderBottom: '1px solid #1a1a1a',
                    fontSize: '9px',
                    fontWeight: 700,
                    color: '#666',
                    letterSpacing: '0.1em',
                    background: '#0a0a0a'
                }}>
                    <span>TIMESTAMP</span>
                    <span>PROCESS</span>
                    <span>LEVEL</span>
                    <span>PAYLOAD</span>
                </div>

                {/* ── LOG ENTRIES ── */}
                <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
                    {entries.length === 0 && (
                        <div style={{ padding: '60px 40px', display: 'flex', flexDirection: 'column', gap: '12px', color: '#444' }}>
                            <div style={{ fontSize: '12px', color: '#888' }}>[SYSTEM_READY] Listening for ingestion events matching internal rule sets...</div>
                            <div style={{ fontSize: '11px' }}>---</div>
                            <div style={{ fontSize: '11px' }}>Awaiting explicit trigger from AppShell Sidebar [SIGNAL TRIGGER] or scheduled CRON job.</div>
                            <div style={{ fontSize: '11px' }}>Buffer capacity: 99.9%</div>
                        </div>
                    )}

                    {entries.map((entry, idx) => {
                        const stepColor = STEP_COLORS[entry.step] || '#777';
                        const levelColor = entry.level === 'error' ? '#FF3333'
                            : entry.level === 'warning' ? '#FFB300'
                                : entry.level === 'success' ? '#00C805' : '#888';

                        return (
                            <div key={idx} style={{
                                display: 'grid',
                                gridTemplateColumns: '80px 100px 70px 1fr',
                                gap: '16px',
                                padding: '6px 20px',
                                borderBottom: '1px solid #0a0a0a',
                                fontSize: '11px',
                                alignItems: 'start',
                                background: idx % 2 === 0 ? 'transparent' : '#060606'
                            }}>
                                <span style={{ color: '#555' }}>{entry.time}</span>
                                <span style={{ color: stepColor }}>[{entry.step}]</span>
                                <span style={{ color: levelColor }}>{entry.level.toUpperCase()}</span>
                                <span style={{ color: '#ccc', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                                    {entry.message}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; text-shadow: 0 0 8px #00C805; }
                    50%       { opacity: 0.4; text-shadow: none; }
                }
            `}</style>
        </AppShell>
    );
}

const btnStyle = {
    background: 'transparent',
    border: '1px solid #333',
    color: '#888',
    padding: '4px 10px',
    fontSize: '9px',
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.05em'
};
