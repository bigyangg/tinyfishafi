// MarketPulse.jsx — Market stress indicator for the top status bar
// Shows 0-100 pulse score with color-coded pulsing circle

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Note: These are fallback colors; CSS variables are used in the component where possible
const PULSE_COLORS = {
    CALM: 'var(--signal-positive)',
    MODERATE: 'var(--filing-10k)',
    ELEVATED: 'var(--filing-sc13d)',
    CRITICAL: 'var(--signal-risk)',
};

export default function MarketPulse() {
    const [pulse, setPulse] = useState(null);
    const [expanded, setExpanded] = useState(false);

    const fetchPulse = useCallback(async () => {
        try {
            const res = await axios.get(`${API}/market/pulse`);
            setPulse(res.data);
        } catch {
            // silent fail
        }
    }, []);

    useEffect(() => {
        fetchPulse();
        const interval = setInterval(fetchPulse, 60000); // Refresh every 60s
        return () => clearInterval(interval);
    }, [fetchPulse]);

    if (!pulse) return null;

    const color = PULSE_COLORS[pulse.label] || '#555';

    return (
        <div style={{ position: 'relative' }}>
            <div
                onClick={() => setExpanded(!expanded)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '7px',
                    padding: '0 14px',
                    borderRight: '1px solid var(--border-default)',
                    cursor: 'pointer',
                    height: '100%',
                }}
            >
                {/* Pulsing circle */}
                <div style={{
                    width: '8px', height: '8px',
                    borderRadius: '50%',
                    background: color,
                    boxShadow: `0 0 6px ${color}50, 0 0 12px ${color}20`,
                    animation: 'pulse-market 2s ease-in-out infinite',
                    flexShrink: 0,
                }} />

                {/* Score */}
                <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: color,
                    fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: '0.02em',
                }}>
                    {pulse.pulse}
                </span>

                {/* Label */}
                <span style={{
                    fontSize: '8px',
                    color: color,
                    letterSpacing: '0.12em',
                    fontFamily: "'JetBrains Mono', monospace",
                    opacity: 0.7,
                }}>
                    {pulse.label}
                </span>
            </div>

            {/* Expanded tooltip */}
            {expanded && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: '0',
                    marginTop: '4px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '4px',
                    padding: '10px 14px',
                    minWidth: '180px',
                    zIndex: 100,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                }}>
                    <div style={{ fontSize: '8px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>
                        MARKET PULSE
                    </div>

                    {/* Progress bar */}
                    <div style={{
                        height: '3px', background: 'var(--border-default)', borderRadius: '2px',
                        marginBottom: '10px', overflow: 'hidden',
                    }}>
                        <div style={{
                            width: `${Math.min(pulse.pulse, 100)}%`,
                            height: '100%',
                            background: color,
                            borderRadius: '2px',
                            transition: 'width 0.5s ease',
                        }} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        <div>
                            <div style={{ fontSize: '7px', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>RISK SIGNALS</div>
                            <div style={{ fontSize: '12px', color: 'var(--signal-risk)', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                                {pulse.risk_signals}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '7px', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>POSITIVE</div>
                            <div style={{ fontSize: '12px', color: 'var(--signal-positive)', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                                {pulse.positive_signals}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '7px', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>AVG IMPACT</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                                {pulse.avg_impact}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '7px', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>SIGNALS</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                                {pulse.signal_count}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes pulse-market {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.3); opacity: 0.7; }
                }
            `}</style>
        </div>
    );
}
