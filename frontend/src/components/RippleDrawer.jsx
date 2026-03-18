// RippleDrawer.jsx — Sector Ripple drawer for signal cards
// Shows affected companies when a filing event propagates through sector/supply chain

import { useState, useEffect } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function RippleDrawer({ signalId }) {
    const [open, setOpen] = useState(false);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open || !signalId || data) return;

        const fetchRipple = async () => {
            setLoading(true);
            try {
                const res = await axios.get(`${API}/signals/${signalId}/ripple`);
                setData(res.data);
            } catch (err) {
                console.error('Ripple fetch failed:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchRipple();
    }, [open, signalId, data]);

    const targets = data?.targets || [];
    const count = targets.length;

    if (!signalId) return null;

    return (
        <div>
            {/* Toggle link */}
            <div
                onClick={() => setOpen(!open)}
                style={{
                    padding: '4px 0',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                }}
            >
                <span style={{
                    fontSize: '8px',
                    color: 'var(--accent-blue)',
                    letterSpacing: '0.06em',
                    fontFamily: "'JetBrains Mono', monospace",
                }}>
                    → {count > 0 ? count : '...'} RIPPLE EFFECTS
                </span>
                <span style={{ fontSize: '8px', color: 'var(--text-tertiary)' }}>
                    {open ? '▾' : '▸'}
                </span>
            </div>

            {/* Expanded drawer */}
            {open && (
                <div style={{
                    borderTop: '1px solid var(--border-default)',
                    padding: '6px 0',
                    animation: 'fadeIn 200ms ease',
                }}>
                    {loading && (
                        <div style={{ fontSize: '8px', color: 'var(--text-muted)', padding: '4px 0', letterSpacing: '0.08em' }}>
                            ANALYZING CORRELATIONS...
                        </div>
                    )}

                    {!loading && targets.length === 0 && (
                        <div style={{ fontSize: '8px', color: 'var(--text-muted)', padding: '4px 0' }}>
                            No sector ripple detected
                        </div>
                    )}

                    {!loading && targets.map((t, i) => (
                        <div
                            key={i}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '3px 0',
                                borderBottom: i < targets.length - 1 ? '1px solid var(--border-default)' : 'none',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {/* Direction arrow */}
                                <span style={{
                                    fontSize: '10px',
                                    color: t.direction === '↑' ? 'var(--signal-positive)' : 'var(--signal-risk)',
                                    fontWeight: 700,
                                }}>
                                    {t.direction}
                                </span>

                                {/* Ticker */}
                                <span style={{
                                    fontSize: '9px',
                                    color: 'var(--text-primary)',
                                    fontWeight: 700,
                                    fontFamily: "'JetBrains Mono', monospace",
                                    letterSpacing: '0.04em',
                                }}>
                                    {t.ticker}
                                </span>

                                {/* Relation badge */}
                                <span style={{
                                    fontSize: '7px',
                                    color: t.relation === 'supply_chain' || t.relation === 'supplier' || t.relation === 'customer'
                                        ? 'var(--accent-blue)' : 'var(--text-muted)',
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase',
                                }}>
                                    {t.relation === 'sector_peer' ? 'PEER' :
                                     t.relation === 'customer' ? 'CUSTOMER' :
                                     t.relation === 'supplier' ? 'SUPPLIER' : t.relation}
                                </span>
                            </div>

                            {/* Price if available */}
                            {t.current_price && (
                                <span style={{
                                    fontSize: '8px',
                                    color: 'var(--text-muted)',
                                    fontFamily: "'JetBrains Mono', monospace",
                                }}>
                                    ${t.current_price}
                                </span>
                            )}
                        </div>
                    ))}

                    {/* Reason line */}
                    {targets.length > 0 && targets[0]?.reason && (
                        <div style={{
                            fontSize: '7px',
                            color: 'var(--text-muted)',
                            marginTop: '4px',
                            fontStyle: 'italic',
                            fontFamily: 'Inter, sans-serif',
                        }}>
                            {targets[0].reason}
                        </div>
                    )}
                </div>
            )}

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
