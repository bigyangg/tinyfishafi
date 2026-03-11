// Signal.jsx — Single signal deep-dive page
import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import axios from 'axios';
import AppShell from '../components/AppShell';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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

    return (
        <AppShell>
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', maxWidth: '760px' }}>

                {/* Back */}
                <button
                    onClick={() => navigate(-1)}
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
                    </div>
                    <div style={{ fontSize: '12px', color: '#333' }}>
                        {signal.company_name || signal.company}
                    </div>
                </div>

                {/* Summary */}
                <div style={{ marginBottom: '28px' }}>
                    <div style={{ fontSize: '9px', color: '#2a2a2a', letterSpacing: '0.12em', marginBottom: '8px' }}>SUMMARY</div>
                    <p style={{ fontSize: '14px', color: '#888', lineHeight: 1.7, margin: 0 }}>
                        {signal.summary}
                    </p>
                </div>

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

                {/* Price correlation */}
                {correlation && (correlation.pct_change_1h != null || correlation.pct_change_24h != null) && (
                    <div style={{ marginBottom: '28px' }}>
                        <div style={{ fontSize: '9px', color: '#2a2a2a', letterSpacing: '0.12em', marginBottom: '12px' }}>PRICE IMPACT</div>
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
