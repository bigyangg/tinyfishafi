// AlertCard.jsx — TICKER -> EVENT -> VERDICT

import { useState, useEffect } from 'react';

function formatRelativeTime(ts) {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

const SIGNAL_CONFIG = {
  Positive: { color: "#00C805", label: "OPPORTUNITY", bg: "#00C80510" },
  Risk: { color: "#FF3333", label: "RISK", bg: "#FF333310" },
  Neutral: { color: "#444", label: "ROUTINE", bg: "transparent" },
  Pending: { color: "#333", label: "PROCESSING", bg: "transparent" },
};

const EVENT_META = {
  EARNINGS_BEAT: { label: "Earnings Beat", color: "#00C805" },
  EARNINGS_MISS: { label: "Earnings Miss", color: "#FF3333" },
  EXEC_DEPARTURE: { label: "Exec Change", color: "#FF6B00" },
  EXEC_APPOINTMENT: { label: "New Leadership", color: "#00C805" },
  MERGER_ACQUISITION: { label: "M&A", color: "#0066FF" },
  LEGAL_REGULATORY: { label: "Legal/Reg", color: "#FF3333" },
  DEBT_FINANCING: { label: "Financing", color: "#666" },
  MATERIAL_EVENT: { label: "Material Event", color: "#FF6B00" },
  DIVIDEND: { label: "Dividend", color: "#00C805" },
  ROUTINE_ADMIN: { label: "Admin 8-K", color: "#252525" },
};

// Clean up summaries that say nothing:
const cleanSummary = (summary, ticker, company) => {
  const junk = [
    "filed a routine administrative 8-K",
    "filed an 8-K to report a current event",
    "announced an 8-K filing",
    "company filed a routine administrative 8-K",
    "Unable to provide a summary",
    "without its full text content",
  ];
  if (!summary) return null;
  const lower = summary.toLowerCase();
  for (const j of junk) {
    if (lower.includes(j.toLowerCase())) return null; // return null = show PROCESSING state
  }
  return summary;
};

export default function AlertCard({ signal, isWatched, onToggleWatch, onClick, isNew }) {
  // Live relative timestamps — re-render every 30s
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const summary = cleanSummary(signal.summary, signal.ticker, signal.company_name);

  const cfg = SIGNAL_CONFIG[signal.classification] || SIGNAL_CONFIG.Neutral;
  const isProcessing = !summary || signal.classification === 'Pending';
  const isRoutine = signal.classification === "Neutral" || signal.classification === "Pending";

  const isHighSignal = (signal.impact_score || 0) >= 60 || signal.classification === "Positive" || signal.classification === "Risk";
  const isNoise = (signal.impact_score || 0) < 20 && signal.classification === "Neutral";
  const eventMeta = EVENT_META[signal.event_type] || { label: "8-K Filing", color: "#252525" };

  const signalBorderColor =
    signal.classification === "Positive" ? "#00C805" :
      signal.classification === "Risk" ? "#FF3333" :
        isHighSignal ? "#444" : "#1a1a1a";

  return (
    <div
      onClick={() => onClick && onClick(signal)}
      className={isNew ? 'signal-enter' : ''}
      data-testid={`alert-card-${signal.id}`}
      style={{
        display: "flex",
        alignItems: "stretch",
        borderLeft: `2px solid ${signalBorderColor}`,
        borderTop: "none",
        borderRight: "1px solid #0d0d0d",
        borderBottom: "1px solid #0d0d0d",
        background: isHighSignal ? "#0c0c0c" : "#080808",
        opacity: isNoise ? 0.6 : 1, // Increased from 0.45 to remain readable
        padding: "12px 16px",
        cursor: "pointer",
        transition: "background 100ms, opacity 150ms",
      }}
      onMouseEnter={e => e.currentTarget.style.background = "#111"}
      onMouseLeave={e => e.currentTarget.style.background = isHighSignal ? "#0c0c0c" : "#080808"}
    >
      <div style={{ display: "flex", width: "100%", gap: "16px", alignItems: "flex-start" }}>

        {/* COL 1: Ticker & Company */}
        <div style={{ width: "90px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontWeight: 700, fontSize: "14px", color: signal.ticker === "UNKNOWN" ? "#555" : "#fff",
            letterSpacing: "0.08em"
          }}>
            {signal.ticker === "UNKNOWN" ? "—" : signal.ticker}
          </span>
          <span style={{
            fontSize: "10px", color: "#666", fontFamily: "'IBM Plex Mono', monospace",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            letterSpacing: "0.04em"
          }} title={signal.company_name}>
            {signal.company_name?.replace(/,?\s+(Inc\.|LLC|Corp|Corporation|Inc|Limited|Ltd\.)$/i, "") || "Unknown"}
          </span>
        </div>

        {/* COL 2: Event Meta & Verdict */}
        <div style={{ width: "110px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{
            fontSize: "11px", color: eventMeta.color, fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: "0.04em"
          }}>
            {eventMeta.label}
          </span>
          {!isRoutine && (
            <span style={{
              fontSize: "9px", padding: "2px 6px", width: "fit-content",
              background: cfg.bg, border: `1px solid ${cfg.color}30`, color: cfg.color,
              fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, letterSpacing: "0.08em"
            }}>
              {cfg.label}
            </span>
          )}
        </div>

        {/* COL 3: Summary text */}
        <div style={{ flex: 1, minWidth: 0, paddingRight: "16px" }}>
          <p style={{
            margin: 0, fontSize: "12px", color: isProcessing ? "#666" : "#bbb",
            lineHeight: 1.5, fontStyle: isProcessing ? "italic" : "normal",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden"
          }}>
            {isProcessing ? "Agent is analyzing filing..." : summary}
          </p>
        </div>

        {/* COL 4: Meta & Watch */}
        <div style={{ width: "80px", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "10px", color: "#666", fontFamily: "'IBM Plex Mono', monospace" }}>
              {formatRelativeTime(signal.filed_at)}
            </span>
            {onToggleWatch && (
              <button
                onClick={e => { e.stopPropagation(); onToggleWatch(signal.ticker); }}
                style={{
                  background: "none", border: "none", padding: 0,
                  color: isWatched ? "#0066FF" : "#444", cursor: "pointer", fontSize: "13px", lineHeight: 1
                }}
                onMouseEnter={e => !isWatched && (e.currentTarget.style.color = "#888")}
                onMouseLeave={e => !isWatched && (e.currentTarget.style.color = "#444")}
                title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
              >
                {isWatched ? "★" : "☆"}
              </button>
            )}
          </div>
          {(signal.impact_score || 0) >= 50 && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
              <div style={{
                width: "16px", height: "2px",
                background: signal.impact_score >= 75 ? "#FF3333" : signal.impact_score >= 60 ? "#FF6B00" : "#FFB300"
              }} />
              <span style={{
                fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", fontWeight: 500,
                color: signal.impact_score >= 75 ? "#FF3333" : signal.impact_score >= 60 ? "#FF6B00" : "#FFB300"
              }}>
                {signal.impact_score}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
