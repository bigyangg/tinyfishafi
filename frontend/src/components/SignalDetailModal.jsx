// SignalDetailModal.jsx — Full overlay modal with correlation fetch
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
                    width: "min(560px, 90vw)",
                    maxHeight: "80vh",
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
                            <div style={{ fontSize: "10px", color: "#333", fontFamily: "'IBM Plex Mono', monospace", marginBottom: "3px", letterSpacing: "0.08em" }}>{label}</div>
                            <div style={{ fontSize: "13px", color: "#888", fontFamily: "'IBM Plex Mono', monospace" }}>{value}</div>
                        </div>
                    ))}
                </div>

                {/* Price correlation */}
                {correlation && (
                    <div style={{ borderTop: "1px solid #111", paddingTop: "16px" }}>
                        <div style={{ fontSize: "10px", color: "#333", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.08em", marginBottom: "12px" }}>PRICE IMPACT</div>
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
                        <div style={{ fontSize: "10px", color: "#222", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.08em", marginBottom: "3px" }}>ACCESSION</div>
                        <div style={{ fontSize: "11px", color: "#333", fontFamily: "'IBM Plex Mono', monospace" }}>{signal.accession_number}</div>
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
