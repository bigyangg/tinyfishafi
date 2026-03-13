// Signal.jsx — Single signal deep-dive page with full audit trail
// Shows: summary, metrics, chain of thought, news cross-check, governance audit, impact breakdown
import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import axios from 'axios';
import AppShell from '../components/AppShell';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── Section wrapper ──
const AuditSection = ({ title, children }) => (
    <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '9px', color: '#2a2a2a', letterSpacing: '0.12em', marginBottom: '10px' }}>
            {title}
        </div>
        {children}
    </div>
);

export default function Signal() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [signal, setSignal] = useState(null);
    const [correlation, setCorrelation] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.allSettled([
            axios.get(`${API}/signals/${id}`),
            axios.get(`${API}/signals/${id}/correlation`),
        ]).then(([sigRes, corrRes]) => {
            if (sigRes.status === 'fulfilled') setSignal(sigRes.value.data);
            if (corrRes.status === 'fulfilled') setCorrelation(corrRes.value.data);
            setLoading(false);
        });
    }, [id]);

    if (loading) {
        return (
            <AppShell>
                <div style={{ padding: '32px', animation: 'fadeIn 300ms' }}>
                    <div style={{ width: '60px', height: '20px', background: '#0a0a0a', animation: 'sk 1.5s ease infinite', marginBottom: '16px' }} />
                    <div style={{ width: '200px', height: '12px', background: '#0a0a0a', animation: 'sk 1.5s ease infinite', marginBottom: '8px' }} />
                    <div style={{ width: '140px', height: '12px', background: '#0a0a0a', animation: 'sk 1.5s ease infinite' }} />
                </div>
            </AppShell>
        );
    }

    if (!signal) {
        return (
            <AppShell>
                <div style={{ padding: '32px', textAlign: 'center' }}>
                    <p style={{ fontSize: '12px', color: '#333', letterSpacing: '0.1em' }}>SIGNAL NOT FOUND</p>
                    <button
                        onClick={() => navigate('/dashboard')}
                        style={{ marginTop: '16px', background: 'none', border: '1px solid #111', color: '#333', padding: '6px 14px', fontSize: '10px', cursor: 'pointer', letterSpacing: '0.08em', fontFamily: "'JetBrains Mono', monospace" }}
                    >
                        ← BACK TO FEED
                    </button>
                </div>
            </AppShell>
        );
    }

    const sigColor = { Positive: '#00C805', Risk: '#FF3333', Neutral: '#333' }[signal.classification] || '#333';
    const cot = signal.chain_of_thought;
    const gov = signal.governance_audit;
    const impact = signal.impact_breakdown;
    const headlines = signal.news_headlines;
    const keyFacts = signal.key_facts;
    const formData = signal.form_data;

    return (
        <AppShell>
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', maxWidth: '760px' }}>

                {/* Back */}
                <button
                    onClick={() => navigate('/dashboard')}
                    style={{ background: 'none', border: 'none', color: '#333', cursor: 'pointer', fontSize: '11px', letterSpacing: '0.08em', padding: '0 0 20px', fontFamily: "'JetBrains Mono', monospace", display: 'block' }}
                >
                    ← BACK TO FEED
                </button>

                {/* Header */}
                <div style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '24px', fontWeight: 700, color: '#fff', letterSpacing: '0.1em' }}>
                            {signal.ticker}
                        </span>
                        <span style={{ fontSize: '11px', padding: '3px 8px', background: `${sigColor}18`, border: `1px solid ${sigColor}44`, color: sigColor }}>
                            {(signal.classification || 'NEUTRAL').toUpperCase()}
                        </span>
                        {signal.event_type && signal.event_type !== 'ROUTINE_ADMIN' && (
                            <span style={{ fontSize: '11px', padding: '3px 8px', background: '#0066FF12', border: '1px solid #0066FF30', color: '#0066FF' }}>
                                {signal.event_type.replace(/_/g, ' ')}
                            </span>
                        )}
                        {signal.filing_type && signal.filing_type !== '8-K' && (
                            <span style={{ fontSize: '11px', padding: '3px 8px', background: '#FFB30012', border: '1px solid #FFB30030', color: '#FFB300' }}>
                                {signal.filing_type}
                            </span>
                        )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#333' }}>
                        {signal.company_name || signal.company}
                    </div>
                </div>

                {/* Summary */}
                <AuditSection title="SUMMARY">
                    <p style={{ fontSize: '14px', color: '#888', lineHeight: 1.7, margin: 0 }}>
                        {signal.summary}
                    </p>
                </AuditSection>

                {/* Key Facts */}
                {keyFacts && keyFacts.length > 0 && (
                    <AuditSection title="KEY FACTS">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {keyFacts.map((fact, i) => (
                                <div key={i} style={{
                                    display: 'flex', gap: '8px', alignItems: 'baseline',
                                    padding: '6px 10px', background: '#080808',
                                }}>
                                    <span style={{ fontSize: '9px', color: '#0066FF', fontWeight: 700, flexShrink: 0 }}>
                                        {String(i + 1).padStart(2, '0')}
                                    </span>
                                    <span style={{ fontSize: '12px', color: '#777', lineHeight: 1.5 }}>
                                        {fact}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </AuditSection>
                )}

                {/* Metrics grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: '#0d0d0d', marginBottom: '28px' }}>
                    {[
                        { label: 'CONFIDENCE', value: `${signal.confidence || 0}%`, color: (signal.confidence || 0) >= 70 ? '#fff' : '#555' },
                        { label: 'IMPACT', value: signal.impact_score || '—', color: '#fff' },
                        { label: 'FILED', value: signal.filed_at ? new Date(signal.filed_at).toLocaleDateString() : '—', color: '#555' },
                        { label: 'TYPE', value: signal.filing_type || '8-K', color: '#555' },
                    ].map(({ label, value, color }) => (
                        <div key={label} style={{ background: '#080808', padding: '14px' }}>
                            <div style={{ fontSize: '9px', color: '#2a2a2a', letterSpacing: '0.12em', marginBottom: '6px' }}>{label}</div>
                            <div style={{ fontSize: '16px', fontWeight: 600, color }}>{value}</div>
                        </div>
                    ))}
                </div>

                {/* ── CHAIN OF THOUGHT ── */}
                {cot && (
                    <AuditSection title="CHAIN OF THOUGHT">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: '#0d0d0d' }}>
                            {[
                                { step: '01', label: 'WHAT HAPPENED', key: 'step1_what_happened' },
                                { step: '02', label: 'WHO IS AFFECTED', key: 'step2_who_is_affected' },
                                { step: '03', label: 'HISTORICAL CONTEXT', key: 'step3_historical_context' },
                                { step: '04', label: 'BULL CASE', key: 'step4_bull_case' },
                                { step: '05', label: 'BEAR CASE', key: 'step5_bear_case' },
                                { step: '06', label: 'FINAL REASONING', key: 'step6_final_reasoning' },
                            ].filter(({ key }) => cot[key]).map(({ step, label, key }) => (
                                <div key={step} style={{ background: '#080808', padding: '12px 14px', display: 'flex', gap: '12px', alignItems: 'baseline' }}>
                                    <span style={{ fontSize: '9px', color: '#0066FF', fontWeight: 700, flexShrink: 0, letterSpacing: '0.06em' }}>
                                        {step}
                                    </span>
                                    <div>
                                        <div style={{ fontSize: '9px', color: '#333', letterSpacing: '0.08em', marginBottom: '4px' }}>
                                            {label}
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#777', lineHeight: 1.6 }}>
                                            {cot[key]}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </AuditSection>
                )}

                {/* ── NEWS CROSS-CHECK ── */}
                {headlines && headlines.length > 0 && (
                    <AuditSection title="NEWS CROSS-CHECK">
                        <div style={{ marginBottom: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                            {signal.news_sentiment && (
                                <span style={{
                                    fontSize: '10px', padding: '3px 8px',
                                    background: signal.news_sentiment === signal.classification ? '#00C80512' : '#FF333312',
                                    border: `1px solid ${signal.news_sentiment === signal.classification ? '#00C80530' : '#FF333330'}`,
                                    color: signal.news_sentiment === signal.classification ? '#00C805' : '#FF3333',
                                    letterSpacing: '0.06em',
                                }}>
                                    {signal.news_sentiment === signal.classification ? 'ALIGNED' : 'DIVERGENT'}
                                </span>
                            )}
                            {signal.divergence_type && (
                                <span style={{ fontSize: '10px', color: '#555' }}>
                                    {signal.divergence_type}
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: '#0d0d0d' }}>
                            {headlines.map((h, i) => (
                                <div key={i} style={{ background: '#080808', padding: '8px 12px', fontSize: '11px', color: '#555', lineHeight: 1.5 }}>
                                    {h}
                                </div>
                            ))}
                        </div>
                    </AuditSection>
                )}

                {/* ── GOVERNANCE AUDIT ── */}
                {gov && gov.length > 0 && (
                    <AuditSection title="GOVERNANCE CHECKS">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: '#0d0d0d' }}>
                            {gov.map((check, i) => (
                                <div key={i} style={{
                                    background: '#080808', padding: '10px 14px',
                                    display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: '10px', alignItems: 'center',
                                }}>
                                    <span style={{ fontSize: '14px' }}>
                                        {check.passed ? '✓' : '✗'}
                                    </span>
                                    <div>
                                        <div style={{ fontSize: '10px', color: check.passed ? '#00C805' : '#FF3333', letterSpacing: '0.08em', fontWeight: 600 }}>
                                            {check.check}
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#444', marginTop: '2px' }}>
                                            {check.reason}
                                        </div>
                                    </div>
                                    {!check.passed && check.action !== 'none' && (
                                        <span style={{ fontSize: '9px', color: '#FF333399', letterSpacing: '0.06em' }}>
                                            {check.action}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </AuditSection>
                )}

                {/* ── IMPACT BREAKDOWN ── */}
                {impact && (
                    <AuditSection title="IMPACT SCORE BREAKDOWN">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: '#0d0d0d' }}>
                            {[
                                { label: 'Event Type Weight', desc: impact.base_event?.label, value: impact.base_event?.contribution, weight: '30%' },
                                { label: 'Confidence', desc: `${impact.confidence?.value || 0}%`, value: impact.confidence?.contribution, weight: '40%' },
                                { label: 'Sentiment', desc: impact.sentiment?.aligned ? 'Aligned' : 'Divergent', value: impact.sentiment?.contribution, weight: '20%' },
                                { label: 'Watchlist Boost', desc: impact.watchlist?.is_watched ? 'Active' : 'None', value: impact.watchlist?.contribution, weight: '10%' },
                            ].map(({ label, desc, value, weight }) => (
                                <div key={label} style={{
                                    background: '#080808', padding: '10px 14px',
                                    display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', alignItems: 'center',
                                }}>
                                    <div>
                                        <div style={{ fontSize: '10px', color: '#555', letterSpacing: '0.06em' }}>{label}</div>
                                        <div style={{ fontSize: '11px', color: '#333', marginTop: '2px' }}>{desc}</div>
                                    </div>
                                    <span style={{ fontSize: '9px', color: '#222', letterSpacing: '0.06em' }}>{weight}</span>
                                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff', minWidth: '35px', textAlign: 'right' }}>
                                        {value != null ? value : '—'}
                                    </span>
                                </div>
                            ))}
                            {impact.governance_penalty > 0 && (
                                <div style={{
                                    background: '#080808', padding: '10px 14px',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                }}>
                                    <span style={{ fontSize: '10px', color: '#FF3333', letterSpacing: '0.06em' }}>GOVERNANCE PENALTY</span>
                                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#FF3333' }}>-{impact.governance_penalty}</span>
                                </div>
                            )}
                            <div style={{
                                background: '#0c0c0c', padding: '12px 14px',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                borderTop: '1px solid #1a1a1a',
                            }}>
                                <span style={{ fontSize: '11px', color: '#888', letterSpacing: '0.08em', fontWeight: 700 }}>TOTAL</span>
                                <span style={{ fontSize: '22px', fontWeight: 800, color: '#fff' }}>{impact.total}/100</span>
                            </div>
                        </div>
                    </AuditSection>
                )}

                {/* ── FORM-SPECIFIC DATA ── */}
                {formData && (
                    <AuditSection title="FORM-SPECIFIC DATA">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: '#0d0d0d' }}>
                            {Object.entries(formData).filter(([, v]) => v != null && v !== '').map(([key, val]) => (
                                <div key={key} style={{ background: '#080808', padding: '10px 14px' }}>
                                    <div style={{ fontSize: '9px', color: '#2a2a2a', letterSpacing: '0.08em', marginBottom: '4px' }}>
                                        {key.replace(/_/g, ' ').toUpperCase()}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#777' }}>
                                        {typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </AuditSection>
                )}

                {/* Price correlation */}
                {correlation && (correlation.pct_change_1h != null || correlation.pct_change_24h != null) && (
                    <AuditSection title="PRICE IMPACT">
                        <div style={{ display: 'flex', gap: '1px', background: '#0d0d0d' }}>
                            {[
                                { label: '1 HOUR', value: correlation.pct_change_1h },
                                { label: '24 HOURS', value: correlation.pct_change_24h },
                                { label: '3 DAYS', value: correlation.pct_change_3d },
                            ].map(({ label, value }) => (
                                <div key={label} style={{ flex: 1, background: '#080808', padding: '14px' }}>
                                    <div style={{ fontSize: '9px', color: '#2a2a2a', letterSpacing: '0.1em', marginBottom: '6px' }}>{label}</div>
                                    <div style={{
                                        fontSize: '20px',
                                        fontWeight: 700,
                                        color: value == null ? '#1e1e1e' : value > 0 ? '#00C805' : value < 0 ? '#FF3333' : '#555',
                                    }}>
                                        {value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </AuditSection>
                )}

                {/* Extraction info */}
                {signal.extraction_source && (
                    <div style={{
                        fontSize: '10px', color: '#222', marginBottom: '16px',
                        display: 'flex', gap: '12px', alignItems: 'center',
                    }}>
                        <span>Extracted via: {signal.extraction_source}</span>
                        {signal.extraction_time_ms && <span>{signal.extraction_time_ms}ms</span>}
                    </div>
                )}

                {/* SEC Link */}
                <a
                    href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${signal.ticker}&type=8-K&dateb=&owner=include&count=5`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '11px', color: '#0066FF', textDecoration: 'none', letterSpacing: '0.06em' }}
                >
                    VIEW ON SEC EDGAR ↗
                </a>

            </div>
        </AppShell>
    );
}
