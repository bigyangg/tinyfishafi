// SignalDetailModal.jsx — Full overlay modal with correlation fetch + v3 enrichment
// Bloomberg Terminal aesthetic. No navigation — stays on dashboard.
// Fetches price correlation inline. Closes on Escape.

import { useState, useEffect, useCallback } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

function SignalBadge({ signal }) {
    const colors = {
        Positive: "#00C805",
        Risk: "#FF3333",
        Neutral: "#525252",
        Pending: "#333",
    };
    const c = colors[signal] || "#525252";
    if (signal === "Neutral" || signal === "Pending") return null;
    return (
        <span style={{
            fontSize: "10px",
            padding: "2px 6px",
            background: `${c}18`,
            border: `1px solid ${c}44`,
            color: c,
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: "0.06em",
        }}>
            {signal?.toUpperCase()}
        </span>
    );
}

function SectionHeader({ label }) {
    return (
        <div style={{
            fontSize: "10px", color: "#333",
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.1em", fontWeight: 600,
            marginBottom: "10px", marginTop: "4px",
        }}>{label}</div>
    );
}

function DataRow({ label, value, color }) {
    if (value === null || value === undefined) return null;
    return (
        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
            <span style={{ fontSize: "11px", color: "#444" }}>{label}</span>
            <span style={{
                fontSize: "12px", color: color || "#888",
                fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
            }}>{value}</span>
        </div>
    );
}

export default function SignalDetailModal({ signal, onClose }) {
    const [correlation, setCorrelation] = useState(null);

    // Fetch correlation data
    useEffect(() => {
        if (!signal?.id) return;
        fetch(`${BACKEND_URL}/api/signals/${signal.id}/correlation`)
            .then(r => r.ok ? r.json() : null)
            .then(data => data && setCorrelation(data))
            .catch(() => null);
    }, [signal?.id]);

    // Close on Escape
    const handleKeyDown = useCallback(e => {
        if (e.key === "Escape") onClose();
    }, [onClose]);

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);

    if (!signal) return null;

    const edgarLink = signal.ticker && signal.ticker !== "UNKNOWN"
        ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${signal.ticker}&type=8-K&dateb=&owner=include&count=5`
        : signal.accession_number
            ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${signal.accession_number}&type=8-K&dateb=&owner=include&count=10`
            : null;

    // Parse news headlines if stored as JSON string
    let newsHeadlines = signal.news_headlines;
    if (typeof newsHeadlines === 'string') {
        try { newsHeadlines = JSON.parse(newsHeadlines); } catch { newsHeadlines = null; }
    }

    // Parse genome pattern matches if stored as JSON string
    let genomePatterns = signal.genome_pattern_matches;
    if (typeof genomePatterns === 'string') {
        try { genomePatterns = JSON.parse(genomePatterns); } catch { genomePatterns = null; }
    }

    // Parse congress trades if stored as JSON string
    let congressTrades = signal.congress_trades;
    if (typeof congressTrades === 'string') {
        try { congressTrades = JSON.parse(congressTrades); } catch { congressTrades = null; }
    }

    const divScore = signal.divergence_score || 0;
    const hasDivergence = divScore > 60;
    const isCriticalDiv = divScore > 80;

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                data-testid="signal-modal-overlay"
                style={{
                    position: "fixed", inset: 0,
                    background: "rgba(0,0,0,0.7)",
                    backdropFilter: "blur(2px)",
                    zIndex: 100,
                    animation: "fadeIn 150ms ease",
                }}
            />
            {/* Modal panel */}
            <div
                data-testid="signal-modal"
                style={{
                    position: "fixed",
                    top: "50%", left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: "min(620px, 92vw)",
                    maxHeight: "85vh",
                    background: "#080808",
                    border: "1px solid #1a1a1a",
                    zIndex: 101,
                    overflow: "auto",
                    animation: "slideDown 150ms ease",
                    padding: "24px",
                }}
            >
                {/* Modal header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
                    <div>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
                            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: "18px", color: "#fff" }}>
                                {signal.ticker}
                            </span>
                            <SignalBadge signal={signal.classification} />
                            {signal.event_type && !["ROUTINE_ADMIN", "UNKNOWN"].includes(signal.event_type) && (
                                <span style={{
                                    fontSize: "10px",
                                    padding: "2px 6px",
                                    background: "#0066FF12",
                                    border: "1px solid #0066FF30",
                                    color: "#0066FF",
                                    fontFamily: "'IBM Plex Mono', monospace",
                                }}>
                                    {signal.event_type.replace(/_/g, " ")}
                                </span>
                            )}
                        </div>
                        <p style={{ margin: 0, fontSize: "13px", color: "#444", fontFamily: "'IBM Plex Mono', monospace" }}>
                            {signal.company_name}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        data-testid="signal-modal-close"
                        style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: "18px", padding: "0 4px" }}
                    >
                        ✕
                    </button>
                </div>

                {/* Summary */}
                <p style={{ fontSize: "14px", color: "#888", lineHeight: 1.6, marginBottom: "20px" }}>
                    {signal.summary}
                </p>

                {/* Metadata grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
                    {[
                        { label: "FILED", value: signal.filed_at ? new Date(signal.filed_at).toLocaleString() : "—" },
                        { label: "CONFIDENCE", value: `${signal.confidence}%` },
                        { label: "IMPACT SCORE", value: signal.impact_score ?? "—" },
                        { label: "EVENT TYPE", value: signal.event_type?.replace(/_/g, " ") || "—" },
                    ].map(({ label, value }) => (
                        <div key={label}>
                            <div style={{ fontSize: "10px", color: "#333", fontFamily: "'JetBrains Mono', monospace", marginBottom: "3px", letterSpacing: "0.08em" }}>{label}</div>
                            <div style={{ fontSize: "13px", color: "#888", fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
                        </div>
                    ))}
                </div>

                {/* ═══ DIVERGENCE SECTION ═══ */}
                {hasDivergence && (
                    <div style={{
                        borderTop: "1px solid #111", paddingTop: "16px", marginBottom: "16px",
                    }}>
                        <SectionHeader label="DIVERGENCE DETECTION" />
                        <div style={{
                            background: isCriticalDiv ? '#FF333308' : '#F59E0B08',
                            border: `1px solid ${isCriticalDiv ? '#FF333325' : '#F59E0B25'}`,
                            borderLeft: `3px solid ${isCriticalDiv ? '#FF3333' : '#F59E0B'}`,
                            padding: '12px 14px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                <span style={{
                                    fontSize: '12px', fontWeight: 700,
                                    color: isCriticalDiv ? '#FF3333' : '#F59E0B',
                                    fontFamily: "'JetBrains Mono', monospace",
                                }}>
                                    SCORE: {divScore}/100
                                </span>
                                <span style={{
                                    fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em',
                                    color: isCriticalDiv ? '#FF3333' : '#F59E0B',
                                    background: isCriticalDiv ? '#FF333315' : '#F59E0B15',
                                    padding: '2px 6px',
                                }}>
                                    {signal.divergence_severity || (isCriticalDiv ? 'CRITICAL' : 'HIGH')}
                                </span>
                            </div>
                            {signal.public_claim && (
                                <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
                                    <span style={{ fontWeight: 600, color: '#777' }}>CEO said: </span>
                                    <span style={{ fontStyle: 'italic' }}>"{signal.public_claim}"</span>
                                </div>
                            )}
                            {signal.filing_reality && (
                                <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
                                    <span style={{ fontWeight: 600, color: '#777' }}>Filing says: </span>
                                    {signal.filing_reality}
                                </div>
                            )}
                            {signal.contradiction_summary && (
                                <div style={{ fontSize: '11px', color: '#555', marginTop: '6px' }}>
                                    {signal.contradiction_summary}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ═══ GENOME ALERT ═══ */}
                {signal.genome_alert && (
                    <div style={{ borderTop: "1px solid #111", paddingTop: "16px", marginBottom: "16px" }}>
                        <SectionHeader label="GENOME ALERT" />
                        <div style={{
                            background: '#0066FF08', border: '1px solid #0066FF20',
                            borderLeft: '3px solid #0066FF', padding: '10px 14px',
                        }}>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
                                <DataRow label="Score" value={signal.genome_score} color="#0066FF" />
                                <DataRow label="Trend" value={signal.genome_trend} color={
                                    signal.genome_trend === 'DETERIORATING' ? '#FF3333' :
                                    signal.genome_trend === 'IMPROVING' ? '#00C805' : '#888'
                                } />
                            </div>
                            {genomePatterns && genomePatterns.length > 0 && (
                                <div style={{ marginTop: '6px' }}>
                                    {genomePatterns.slice(0, 3).map((p, i) => (
                                        <div key={i} style={{ fontSize: '10px', color: '#555', marginBottom: '2px' }}>
                                            <span style={{ color: '#666', fontWeight: 600 }}>{p.pattern}</span>
                                            {' '}{p.count} filings — {p.similarity}% match
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ═══ SOCIAL SENTIMENT ═══ */}
                {(signal.reddit_sentiment !== null || signal.stocktwits_sentiment !== null || signal.social_vs_filing_delta) && (
                    <div style={{ borderTop: "1px solid #111", paddingTop: "16px", marginBottom: "16px" }}>
                        <SectionHeader label="SOCIAL SENTIMENT" />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                            <DataRow label="Reddit" value={
                                signal.reddit_sentiment != null ? `${parseFloat(signal.reddit_sentiment).toFixed(2)}` : null
                            } color={parseFloat(signal.reddit_sentiment) > 0 ? '#00C805' : parseFloat(signal.reddit_sentiment) < 0 ? '#FF3333' : '#888'} />
                            <DataRow label="StockTwits" value={
                                signal.stocktwits_sentiment != null ? `${parseFloat(signal.stocktwits_sentiment).toFixed(2)}` : null
                            } color={parseFloat(signal.stocktwits_sentiment) > 0 ? '#00C805' : parseFloat(signal.stocktwits_sentiment) < 0 ? '#FF3333' : '#888'} />
                        </div>
                        {signal.social_volume_spike && (
                            <div style={{ fontSize: '10px', color: '#F59E0B', marginTop: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                                ⚡ VOLUME SPIKE DETECTED
                            </div>
                        )}
                        {signal.social_vs_filing_delta && signal.social_vs_filing_delta !== 'NEUTRAL' && (
                            <div style={{ fontSize: '10px', color: '#555', marginTop: '4px' }}>
                                Social vs Filing: <span style={{
                                    color: signal.social_vs_filing_delta === 'ALIGNED_BULLISH' ? '#00C805' :
                                        signal.social_vs_filing_delta === 'ALIGNED_BEARISH' ? '#FF3333' :
                                        signal.social_vs_filing_delta === 'CONFLICTING' ? '#F59E0B' : '#555',
                                    fontWeight: 600,
                                }}>{signal.social_vs_filing_delta.replace(/_/g, ' ')}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ INSIDER ACTIVITY ═══ */}
                {(signal.insider_net_30d != null || signal.insider_ceo_activity) && (
                    <div style={{ borderTop: "1px solid #111", paddingTop: "16px", marginBottom: "16px" }}>
                        <SectionHeader label="INSIDER ACTIVITY" />
                        <DataRow label="Net 30d" value={
                            signal.insider_net_30d != null ? `$${Math.abs(parseFloat(signal.insider_net_30d)).toLocaleString(undefined, {maximumFractionDigits: 0})}` : null
                        } color={parseFloat(signal.insider_net_30d) > 0 ? '#00C805' : '#FF3333'} />
                        <DataRow label="Net 90d" value={
                            signal.insider_net_90d != null ? `$${Math.abs(parseFloat(signal.insider_net_90d)).toLocaleString(undefined, {maximumFractionDigits: 0})}` : null
                        } color={parseFloat(signal.insider_net_90d) > 0 ? '#00C805' : '#FF3333'} />
                        {signal.insider_ceo_activity && signal.insider_ceo_activity !== 'NONE' && (
                            <DataRow label="CEO" value={signal.insider_ceo_activity} color={
                                signal.insider_ceo_activity === 'BUYING' ? '#00C805' : '#FF3333'
                            } />
                        )}
                        {signal.insider_unusual_delay && (
                            <div style={{ fontSize: '10px', color: '#F59E0B', marginTop: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                                ⚠ UNUSUAL FILING DELAY DETECTED
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ CONGRESS TRADES ═══ */}
                {(signal.congress_net_sentiment && signal.congress_net_sentiment !== 'NEUTRAL') && (
                    <div style={{ borderTop: "1px solid #111", paddingTop: "16px", marginBottom: "16px" }}>
                        <SectionHeader label="CONGRESS TRADING" />
                        <DataRow label="Net Sentiment" value={signal.congress_net_sentiment} color={
                            signal.congress_net_sentiment === 'BUYING' ? '#00C805' : '#FF3333'
                        } />
                        {signal.congress_suspicious_timing && (
                            <div style={{ fontSize: '10px', color: '#FF3333', marginTop: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                                🚨 SUSPICIOUS TIMING DETECTED
                            </div>
                        )}
                        {signal.congress_timing_note && (
                            <div style={{ fontSize: '10px', color: '#555', marginTop: '4px' }}>
                                {signal.congress_timing_note}
                            </div>
                        )}
                        {congressTrades && congressTrades.length > 0 && (
                            <div style={{ marginTop: '8px' }}>
                                {congressTrades.slice(0, 5).map((t, i) => (
                                    <div key={i} style={{
                                        fontSize: '10px', color: '#555', padding: '3px 0',
                                        borderBottom: '1px solid #0d0d0d',
                                    }}>
                                        <span style={{ color: '#777', fontWeight: 600 }}>{t.member || t.name}</span>
                                        {' '}({t.party || '?'}) — {t.type || t.transaction_type || '?'}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ NEWS HEADLINES ═══ */}
                {newsHeadlines && newsHeadlines.length > 0 && (
                    <div style={{ borderTop: "1px solid #111", paddingTop: "16px", marginBottom: "16px" }}>
                        <SectionHeader label="NEWS HEADLINES" />
                        {signal.news_dominant_theme && (
                            <div style={{ fontSize: '10px', color: '#0066FF', marginBottom: '8px', fontFamily: "'JetBrains Mono', monospace" }}>
                                Theme: {signal.news_dominant_theme.replace(/_/g, ' ')}
                            </div>
                        )}
                        {newsHeadlines.slice(0, 5).map((h, i) => (
                            <div key={i} style={{
                                padding: '6px 0', borderBottom: '1px solid #0d0d0d',
                                fontSize: '11px', color: '#666',
                            }}>
                                {typeof h === 'string' ? h : (
                                    <>
                                        <div>{h.headline}</div>
                                        {h.source && <span style={{ fontSize: '9px', color: '#333' }}>— {h.source}</span>}
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Price correlation */}
                {correlation && (
                    <div style={{ borderTop: "1px solid #111", paddingTop: "16px" }}>
                        <SectionHeader label="PRICE IMPACT" />
                        <div style={{ display: "flex", gap: "24px" }}>
                            {[
                                { label: "1H", value: correlation.pct_change_1h },
                                { label: "24H", value: correlation.pct_change_24h },
                                { label: "3D", value: correlation.pct_change_3d },
                            ].map(({ label, value }) => (
                                <div key={label}>
                                    <div style={{ fontSize: "10px", color: "#333", fontFamily: "'IBM Plex Mono', monospace", marginBottom: "4px" }}>{label}</div>
                                    <div style={{
                                        fontSize: "20px",
                                        fontFamily: "'IBM Plex Mono', monospace",
                                        fontWeight: 600,
                                        color: value == null ? "#222" : value > 0 ? "#00C805" : value < 0 ? "#FF3333" : "#555"
                                    }}>
                                        {value == null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Accession number */}
                {signal.accession_number && (
                    <div style={{ borderTop: "1px solid #0d0d0d", marginTop: "16px", paddingTop: "12px" }}>
                        <div style={{ fontSize: "10px", color: "#222", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", marginBottom: "3px" }}>ACCESSION</div>
                        <div style={{ fontSize: "11px", color: "#333", fontFamily: "'JetBrains Mono', monospace" }}>{signal.accession_number}</div>
                    </div>
                )}

                {/* SEC link */}
                {edgarLink && (
                    <div style={{ borderTop: "1px solid #0d0d0d", marginTop: "16px", paddingTop: "16px" }}>
                        <a
                            href={edgarLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="signal-modal-edgar-link"
                            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#0066FF", textDecoration: "none", letterSpacing: "0.06em" }}
                        >
                            VIEW ON SEC EDGAR ↗
                        </a>
                    </div>
                )}
            </div>
        </>
    );
}
