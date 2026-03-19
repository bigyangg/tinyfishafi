// SignalDetailModal.jsx — Full overlay modal with correlation fetch + v3 enrichment
// Bloomberg Terminal aesthetic. No navigation — stays on dashboard.
// Fetches price correlation inline. Closes on Escape.

import { useState, useEffect, useCallback } from 'react';
import TinyFishContext from './TinyFishContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

function SignalBadge({ signal }) {
    const colors = {
        Positive: "var(--signal-positive)",
        Risk: "var(--signal-risk)",
        Neutral: "var(--text-secondary)",
        Pending: "var(--text-muted)",
    };
    const c = colors[signal] || "var(--text-secondary)";
    if (signal === "Neutral" || signal === "Pending") return null;
    return (
        <span style={{
            fontSize: "10px",
            padding: "2px 6px",
            background: `${c}18`,
            border: `1px solid ${c}44`,
            color: c,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.06em",
        }}>
            {signal?.toUpperCase()}
        </span>
    );
}

function SectionHeader({ label }) {
    return (
        <div style={{
            fontSize: "10px", color: "var(--text-muted)",
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
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{label}</span>
            <span style={{
                fontSize: "12px", color: color || "var(--text-secondary)",
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
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
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
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "18px", color: "var(--text-primary)" }}>
                                {signal.ticker}
                            </span>
                            <SignalBadge signal={signal.classification} />
                            {signal.event_type && !["ROUTINE_ADMIN", "UNKNOWN"].includes(signal.event_type) && (
                                <span style={{
                                    fontSize: "10px",
                                    padding: "2px 6px",
                                    background: "var(--accent-blue-bg)",
                                    border: "1px solid var(--accent-blue-border)",
                                    color: "var(--accent-blue)",
                                    fontFamily: "'IBM Plex Mono', monospace",
                                }}>
                                    {signal.event_type.replace(/_/g, " ")}
                                </span>
                            )}
                        </div>
                        <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)", fontFamily: "'IBM Plex Mono', monospace" }}>
                            {signal.company_name}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        data-testid="signal-modal-close"
                        style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: "18px", padding: "0 4px" }}
                    >
                        ✕
                    </button>
                </div>

                {/* Summary */}
                <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "20px" }}>
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
                            <div style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "'JetBrains Mono', monospace", marginBottom: "3px", letterSpacing: "0.08em" }}>{label}</div>
                            <div style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
                        </div>
                    ))}
                </div>

                {/* ═══ DIVERGENCE SECTION ═══ */}
                {hasDivergence && (
                    <div style={{
                        borderTop: "1px solid var(--border-default)", paddingTop: "16px", marginBottom: "16px",
                    }}>
                        <SectionHeader label="DIVERGENCE DETECTION" />
                        <div style={{
                            background: isCriticalDiv ? 'var(--signal-risk-bg)' : 'rgba(251, 191, 36, 0.08)',
                            border: `1px solid ${isCriticalDiv ? 'var(--signal-risk)' : 'var(--filing-10k)'}25`,
                            borderLeft: `3px solid ${isCriticalDiv ? 'var(--signal-risk)' : 'var(--filing-10k)'}`,
                            padding: '12px 14px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                <span style={{
                                    fontSize: '12px', fontWeight: 700,
                                    color: isCriticalDiv ? 'var(--signal-risk)' : 'var(--filing-10k)',
                                    fontFamily: "'JetBrains Mono', monospace",
                                }}>
                                    SCORE: {divScore}/100
                                </span>
                                <span style={{
                                    fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em',
                                    color: isCriticalDiv ? 'var(--signal-risk)' : 'var(--filing-10k)',
                                    background: isCriticalDiv ? 'var(--signal-risk-bg)' : 'rgba(251, 191, 36, 0.15)',
                                    padding: '2px 6px',
                                }}>
                                    {signal.divergence_severity || (isCriticalDiv ? 'CRITICAL' : 'HIGH')}
                                </span>
                            </div>
                            {signal.public_claim && (
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                    <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>CEO said: </span>
                                    <span style={{ fontStyle: 'italic' }}>"{signal.public_claim}"</span>
                                </div>
                            )}
                            {signal.filing_reality && (
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                    <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Filing says: </span>
                                    {signal.filing_reality}
                                </div>
                            )}
                            {signal.contradiction_summary && (
                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                                    {signal.contradiction_summary}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ═══ GENOME ALERT ═══ */}
                {signal.genome_alert && (
                    <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "16px", marginBottom: "16px" }}>
                        <SectionHeader label="GENOME ALERT" />
                        <div style={{
                            background: 'var(--accent-blue-bg)', border: '1px solid var(--accent-blue-border)',
                            borderLeft: '3px solid var(--accent-blue)', padding: '10px 14px',
                        }}>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
                                <DataRow label="Score" value={signal.genome_score} color="var(--accent-blue)" />
                                <DataRow label="Trend" value={signal.genome_trend} color={
                                    signal.genome_trend === 'DETERIORATING' ? 'var(--signal-risk)' :
                                    signal.genome_trend === 'IMPROVING' ? 'var(--signal-positive)' : 'var(--text-secondary)'
                                } />
                            </div>
                            {genomePatterns && genomePatterns.length > 0 && (
                                <div style={{ marginTop: '6px' }}>
                                    {genomePatterns.slice(0, 3).map((p, i) => (
                                        <div key={i} style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '2px' }}>
                                            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{p.pattern}</span>
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
                    <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "16px", marginBottom: "16px" }}>
                        <SectionHeader label="SOCIAL SENTIMENT" />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                            <DataRow label="Reddit" value={
                                signal.reddit_sentiment != null ? `${parseFloat(signal.reddit_sentiment).toFixed(2)}` : null
                            } color={parseFloat(signal.reddit_sentiment) > 0 ? 'var(--signal-positive)' : parseFloat(signal.reddit_sentiment) < 0 ? 'var(--signal-risk)' : 'var(--text-secondary)'} />
                            <DataRow label="StockTwits" value={
                                signal.stocktwits_sentiment != null ? `${parseFloat(signal.stocktwits_sentiment).toFixed(2)}` : null
                            } color={parseFloat(signal.stocktwits_sentiment) > 0 ? 'var(--signal-positive)' : parseFloat(signal.stocktwits_sentiment) < 0 ? 'var(--signal-risk)' : 'var(--text-secondary)'} />
                        </div>
                        {signal.social_volume_spike && (
                            <div style={{ fontSize: '10px', color: 'var(--filing-10k)', marginTop: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                                ⚡ VOLUME SPIKE DETECTED
                            </div>
                        )}
                        {signal.social_vs_filing_delta && signal.social_vs_filing_delta !== 'NEUTRAL' && (
                            <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                Social vs Filing: <span style={{
                                    color: signal.social_vs_filing_delta === 'ALIGNED_BULLISH' ? 'var(--signal-positive)' :
                                        signal.social_vs_filing_delta === 'ALIGNED_BEARISH' ? 'var(--signal-risk)' :
                                        signal.social_vs_filing_delta === 'CONFLICTING' ? 'var(--filing-10k)' : 'var(--text-tertiary)',
                                    fontWeight: 600,
                                }}>{signal.social_vs_filing_delta.replace(/_/g, ' ')}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ INSIDER ACTIVITY ═══ */}
                {(signal.insider_net_30d != null || signal.insider_ceo_activity) && (
                    <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "16px", marginBottom: "16px" }}>
                        <SectionHeader label="INSIDER ACTIVITY" />
                        <DataRow label="Net 30d" value={
                            signal.insider_net_30d != null ? `$${Math.abs(parseFloat(signal.insider_net_30d)).toLocaleString(undefined, {maximumFractionDigits: 0})}` : null
                        } color={parseFloat(signal.insider_net_30d) > 0 ? 'var(--signal-positive)' : 'var(--signal-risk)'} />
                        <DataRow label="Net 90d" value={
                            signal.insider_net_90d != null ? `$${Math.abs(parseFloat(signal.insider_net_90d)).toLocaleString(undefined, {maximumFractionDigits: 0})}` : null
                        } color={parseFloat(signal.insider_net_90d) > 0 ? 'var(--signal-positive)' : 'var(--signal-risk)'} />
                        {signal.insider_ceo_activity && signal.insider_ceo_activity !== 'NONE' && (
                            <DataRow label="CEO" value={signal.insider_ceo_activity} color={
                                signal.insider_ceo_activity === 'BUYING' ? 'var(--signal-positive)' : 'var(--signal-risk)'
                            } />
                        )}
                        {signal.insider_unusual_delay && (
                            <div style={{ fontSize: '10px', color: 'var(--filing-10k)', marginTop: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                                ⚠ UNUSUAL FILING DELAY DETECTED
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ CONGRESS TRADES ═══ */}
                {(signal.congress_net_sentiment && signal.congress_net_sentiment !== 'NEUTRAL') && (
                    <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "16px", marginBottom: "16px" }}>
                        <SectionHeader label="CONGRESS TRADING" />
                        <DataRow label="Net Sentiment" value={signal.congress_net_sentiment} color={
                            signal.congress_net_sentiment === 'BUYING' ? 'var(--signal-positive)' : 'var(--signal-risk)'
                        } />
                        {signal.congress_suspicious_timing && (
                            <div style={{ fontSize: '10px', color: 'var(--signal-risk)', marginTop: '6px', fontFamily: "'JetBrains Mono', monospace" }}>
                                🚨 SUSPICIOUS TIMING DETECTED
                            </div>
                        )}
                        {signal.congress_timing_note && (
                            <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                {signal.congress_timing_note}
                            </div>
                        )}
                        {congressTrades && congressTrades.length > 0 && (
                            <div style={{ marginTop: '8px' }}>
                                {congressTrades.slice(0, 5).map((t, i) => (
                                    <div key={i} style={{
                                        fontSize: '10px', color: 'var(--text-tertiary)', padding: '3px 0',
                                        borderBottom: '1px solid var(--border-default)',
                                    }}>
                                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{t.member || t.name}</span>
                                        {' '}({t.party || '?'}) — {t.type || t.transaction_type || '?'}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ NEWS HEADLINES ═══ */}
                {newsHeadlines && newsHeadlines.length > 0 && (
                    <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "16px", marginBottom: "16px" }}>
                        <SectionHeader label="NEWS HEADLINES" />
                        {signal.news_dominant_theme && (
                            <div style={{ fontSize: '10px', color: 'var(--accent-blue)', marginBottom: '8px', fontFamily: "'JetBrains Mono', monospace" }}>
                                Theme: {signal.news_dominant_theme.replace(/_/g, ' ')}
                            </div>
                        )}
                        {newsHeadlines.slice(0, 5).map((h, i) => (
                            <div key={i} style={{
                                padding: '6px 0', borderBottom: '1px solid var(--border-default)',
                                fontSize: '11px', color: 'var(--text-secondary)',
                            }}>
                                {typeof h === 'string' ? h : (
                                    <>
                                        <div>{h.headline}</div>
                                        {h.source && <span style={{ fontSize: '9px', color: 'var(--text-tertiary)' }}>— {h.source}</span>}
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                {/* ═══ TINYFISH DEEP CONTEXT ═══ */}
                <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '16px', marginBottom: '16px' }}>
                    <SectionHeader label="DEEP CONTEXT" />
                    <TinyFishContext signalId={signal.id} />
                </div>

                {/* Price correlation */}
                {correlation && (
                    <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "16px" }}>
                        <SectionHeader label="PRICE IMPACT" />
                        <div style={{ display: "flex", gap: "24px" }}>
                            {[
                                { label: "1H", value: correlation.pct_change_1h },
                                { label: "24H", value: correlation.pct_change_24h },
                                { label: "3D", value: correlation.pct_change_3d },
                            ].map(({ label, value }) => (
                                <div key={label}>
                                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "'IBM Plex Mono', monospace", marginBottom: "4px" }}>{label}</div>
                                    <div style={{
                                        fontSize: "20px",
                                        fontFamily: "'IBM Plex Mono', monospace",
                                        fontWeight: 600,
                                        color: value == null ? "var(--text-muted)" : value > 0 ? "var(--signal-positive)" : value < 0 ? "var(--signal-risk)" : "var(--text-tertiary)"
                                    }}>
                                        {value == null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* WHY IT MATTERS */}
                {(signal.why_it_matters || signal.market_impact) && (
                  <div style={{
                    background:'var(--bg-card)',border:'1px solid var(--border-default)',
                    borderRadius:8,padding:14,marginBottom:12
                  }}>
                    <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',
                      textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>
                      WHY IT MATTERS
                    </div>
                    {signal.why_it_matters && (
                      <p style={{fontSize:13,color:'var(--text-primary)',lineHeight:1.6,
                        margin:0,borderLeft:'3px solid var(--accent-blue)',paddingLeft:10}}>
                        {signal.why_it_matters}
                      </p>
                    )}
                    {signal.market_impact && (
                      <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,
                        margin:'8px 0 0',paddingLeft:13}}>
                        {signal.market_impact}
                      </p>
                    )}
                  </div>
                )}

                {/* CHAIN REACTIONS */}
                {signal.chain_reactions?.length > 0 && (
                  <div style={{
                    background:'var(--bg-card)',border:'1px solid var(--border-default)',
                    borderRadius:8,padding:14,marginBottom:12
                  }}>
                    <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',
                      textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>
                      CHAIN REACTIONS
                    </div>
                    {signal.chain_reactions.map((reaction, i) => (
                      <div key={i} style={{
                        display:'flex',gap:10,marginBottom:8,paddingBottom:8,
                        borderBottom: i < signal.chain_reactions.length-1
                          ? '1px solid var(--border-default)' : 'none'
                      }}>
                        <div style={{fontSize:9,fontWeight:700,padding:'2px 6px',
                          borderRadius:3,background:'var(--bg-hover)',color:'var(--text-muted)',
                          whiteSpace:'nowrap',height:'fit-content',textTransform:'uppercase'}}>
                          {reaction.layer}
                        </div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:12,color:'var(--text-primary)'}}>{reaction.effect}</div>
                          <div style={{fontSize:10,color:'var(--text-muted)',marginTop:2,
                            fontFamily:'monospace'}}>{reaction.timeframe}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* MARKET RIPPLE / RELATED ENTITIES */}
                {signal.related_entities?.length > 0 && (
                  <div style={{
                    background:'var(--bg-card)',border:'1px solid var(--border-default)',
                    borderRadius:8,padding:14,marginBottom:12
                  }}>
                    <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',
                      textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>
                      MARKET RIPPLE
                    </div>
                    {signal.related_entities.slice(0,6).map((entity, i) => (
                      <div key={i} style={{
                        display:'flex',alignItems:'center',gap:10,padding:'6px 0',
                        borderBottom: i < Math.min(signal.related_entities.length,6)-1
                          ? '1px solid var(--border-default)' : 'none'
                      }}>
                        <span style={{fontSize:12,fontWeight:700,fontFamily:'monospace',
                          color:'var(--text-primary)',width:44}}>{entity.ticker}</span>
                        <span style={{
                          fontSize:9,padding:'1px 5px',borderRadius:3,fontWeight:700,whiteSpace:'nowrap',
                          background: entity.impact_direction === 'positive' ? 'var(--signal-positive-bg)'
                            : entity.impact_direction === 'negative' ? 'var(--signal-risk-bg)' : 'var(--bg-hover)',
                          color: entity.impact_direction === 'positive' ? 'var(--signal-positive)'
                            : entity.impact_direction === 'negative' ? 'var(--signal-risk)' : 'var(--text-muted)',
                        }}>
                          {entity.impact_direction === 'positive' ? '\u2191 BENEFIT'
                           : entity.impact_direction === 'negative' ? '\u2193 RISK' : '\u2192 WATCH'}
                        </span>
                        <span style={{fontSize:11,color:'var(--text-secondary)',flex:1,lineHeight:1.4}}>
                          {entity.reason}
                        </span>
                        <span style={{fontSize:9,color:'var(--text-muted)',fontFamily:'monospace',whiteSpace:'nowrap'}}>
                          {entity.relationship}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Accession number */}
                {signal.accession_number && (
                    <div style={{ borderTop: "1px solid var(--border-default)", marginTop: "16px", paddingTop: "12px" }}>
                        <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", marginBottom: "3px" }}>ACCESSION</div>
                        <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "'JetBrains Mono', monospace" }}>{signal.accession_number}</div>
                    </div>
                )}

                {/* SEC link */}
                {edgarLink && (
                    <div style={{ borderTop: "1px solid var(--border-default)", marginTop: "16px", paddingTop: "16px" }}>
                        <a
                            href={edgarLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="signal-modal-edgar-link"
                            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "var(--accent-blue)", textDecoration: "none", letterSpacing: "0.06em" }}
                        >
                            VIEW ON SEC EDGAR ↗
                        </a>
                    </div>
                )}
            </div>
        </>
    );
}
