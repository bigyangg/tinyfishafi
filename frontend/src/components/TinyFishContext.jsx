// TinyFishContext.jsx — Deep Context enrichment panel with 8s "live enrichment" illusion
// Shows entities, financial figures, risk language, and forward guidance

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function TinyFishContext({ signalId }) {
    const [context, setContext] = useState(null);
    const [status, setStatus] = useState('loading'); // loading | enriching | ready | unavailable
    const [progress, setProgress] = useState(0);
    const [visible, setVisible] = useState(false);

    // Polling for context
    const fetchContext = useCallback(async () => {
        if (!signalId) return;
        try {
            const res = await axios.get(`${API}/signals/${signalId}/context`);
            const data = res.data;

            if (data.status === 'ready') {
                setContext(data.context);
                setStatus('ready');
                return true; // stop polling
            } else if (data.status === 'unavailable') {
                setStatus('unavailable');
                return true;
            } else {
                setStatus('enriching');
                return false;
            }
        } catch {
            setStatus('unavailable');
            return true;
        }
    }, [signalId]);

    useEffect(() => {
        if (!signalId) return;

        let cancelled = false;
        let pollCount = 0;

        const poll = async () => {
            if (cancelled) return;
            const done = await fetchContext();
            pollCount++;
            if (!done && pollCount < 7 && !cancelled) {
                setTimeout(poll, 3000);
            }
        };
        poll();

        // 8-second enrichment illusion timer
        const progressInterval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(progressInterval);
                    return 100;
                }
                return prev + 12.5; // fills in ~8 seconds
            });
        }, 1000);

        // Show content after 8s delay (enrichment illusion)
        const revealTimer = setTimeout(() => {
            setVisible(true);
        }, 8000);

        return () => {
            cancelled = true;
            clearInterval(progressInterval);
            clearTimeout(revealTimer);
        };
    }, [signalId, fetchContext]);

    if (status === 'unavailable' && !context) return null;

    // During enrichment: show spinner
    if (!visible && status !== 'ready') {
        return (
            <div style={{
                padding: '10px 12px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-default)',
                borderRadius: '4px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <div style={{
                        width: '5px', height: '5px', borderRadius: '50%',
                        background: 'var(--accent-blue)',
                        animation: 'pulse-tf 1.5s ease-in-out infinite',
                    }} />
                    <span style={{
                        fontSize: '8px', color: 'var(--accent-blue)',
                        letterSpacing: '0.12em',
                        fontFamily: "'JetBrains Mono', monospace",
                    }}>
                        ENRICHING VIA TINYFISH...
                    </span>
                </div>

                {/* Progress bar */}
                <div style={{
                    height: '2px', background: 'var(--border-default)',
                    borderRadius: '1px', overflow: 'hidden',
                }}>
                    <div style={{
                        width: `${Math.min(progress, 100)}%`,
                        height: '100%',
                        background: 'var(--accent-blue)',
                        borderRadius: '1px',
                        transition: 'width 1s linear',
                    }} />
                </div>

                <style>{`
                    @keyframes pulse-tf {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.3; }
                    }
                `}</style>
            </div>
        );
    }

    // If we have context — show it
    if (!context) return null;

    return (
        <div style={{
            padding: '10px 12px',
            background: 'var(--bg-card)',
            border: '1px solid var(--accent-blue-border)',
            borderRadius: '4px',
            animation: 'fadeInContext 500ms ease',
        }}>
            <div style={{
                fontSize: '8px', color: 'var(--accent-blue)', letterSpacing: '0.12em',
                marginBottom: '10px', fontFamily: "'JetBrains Mono', monospace",
            }}>
                🐟 TINYFISH DEEP CONTEXT
            </div>

            {/* Entities */}
            {context.key_entities?.length > 0 && (
                <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '7px', color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: '4px' }}>
                        KEY ENTITIES
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                        {context.key_entities.slice(0, 8).map((e, i) => (
                            <span key={i} style={{
                                fontSize: '7px', padding: '1px 5px',
                                background: 'var(--bg-hover)', border: '1px solid var(--border-default)',
                                borderRadius: '2px', color: 'var(--text-secondary)',
                                fontFamily: "'JetBrains Mono', monospace",
                            }}>
                                {e}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Financial Figures */}
            {context.financial_figures?.length > 0 && (
                <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '7px', color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: '4px' }}>
                        FINANCIAL FIGURES
                    </div>
                    {context.financial_figures.slice(0, 5).map((f, i) => (
                        <div key={i} style={{
                            fontSize: '8px', color: 'var(--signal-positive)',
                            fontFamily: "'JetBrains Mono', monospace",
                            padding: '1px 0',
                        }}>
                            {f.value}
                        </div>
                    ))}
                </div>
            )}

            {/* Risk Language */}
            {context.risk_language?.length > 0 && (
                <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '7px', color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: '4px' }}>
                        ⚠ RISK LANGUAGE
                    </div>
                    {context.risk_language.slice(0, 3).map((r, i) => (
                        <div key={i} style={{
                            fontSize: '7px', color: 'var(--signal-risk)', lineHeight: 1.4,
                            fontFamily: 'Inter, sans-serif', padding: '1px 0',
                            opacity: 0.8,
                        }}>
                            "...{r}..."
                        </div>
                    ))}
                </div>
            )}

            {/* Forward Guidance */}
            {context.forward_guidance?.length > 0 && (
                <div>
                    <div style={{ fontSize: '7px', color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: '4px' }}>
                        📈 FORWARD GUIDANCE
                    </div>
                    {context.forward_guidance.slice(0, 3).map((g, i) => (
                        <div key={i} style={{
                            fontSize: '7px', color: 'var(--text-tertiary)', lineHeight: 1.4,
                            fontFamily: 'Inter, sans-serif', padding: '1px 0',
                        }}>
                            {g}
                        </div>
                    ))}
                </div>
            )}

            {/* Extraction completeness bar */}
            {context.extraction_completeness != null && (
                <div style={{ marginTop: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ fontSize: '6px', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>EXTRACTION DEPTH</span>
                        <span style={{ fontSize: '6px', color: 'var(--accent-blue)', fontFamily: "'JetBrains Mono', monospace" }}>
                            {context.extraction_completeness}%
                        </span>
                    </div>
                    <div style={{ height: '2px', background: 'var(--border-default)', borderRadius: '1px', overflow: 'hidden' }}>
                        <div style={{
                            width: `${context.extraction_completeness}%`,
                            height: '100%',
                            background: 'var(--accent-blue)',
                            borderRadius: '1px',
                        }} />
                    </div>
                </div>
            )}

            <style>{`
                @keyframes fadeInContext {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
