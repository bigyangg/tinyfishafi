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

const IMPACT_LABEL = (score) => {
  if (score >= 65) return { label: "HIGH IMPACT", color: "#FF6B00" };
  if (score >= 35) return { label: "MED IMPACT", color: "#FFB300" };
  return { label: "LOW IMPACT", color: "#2a2a2a" };
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

  const cfg = SIGNAL_CONFIG[signal.classification] || SIGNAL_CONFIG.Neutral;
  const impact = IMPACT_LABEL(signal.impact_score || 0);
  const summary = cleanSummary(signal.summary, signal.ticker, signal.company_name);
  const isProcessing = !summary || signal.classification === 'Pending';
  const isRoutine = signal.classification === "Neutral" || signal.classification === "Pending";

  return (
    <div
      onClick={() => onClick && onClick(signal)}
      className={isNew ? 'signal-enter' : ''}
      data-testid={`alert-card-${signal.id}`}
      style={{
        display: "flex",
        borderBottom: "1px solid #0f0f0f",
        background: "#050505",
        cursor: "pointer",
        transition: "background 80ms",
        opacity: isProcessing ? 0.45 : 1,
      }}
      onMouseEnter={e => e.currentTarget.style.background = "#0a0a0a"}
      onMouseLeave={e => e.currentTarget.style.background = "#050505"}
    >
      {/* LEFT: Signal color stripe — the verdict at a glance */}
      <div style={{
        width: "3px",
        background: cfg.color,
        flexShrink: 0,
        opacity: isRoutine ? 0.2 : 1,
      }} />

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, padding: "14px 16px" }}>

        {/* ROW 1: Ticker + Event + Signal verdict + Watch */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>

          {/* Ticker — primary identity, always first */}
          <span style={{
            fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
            fontWeight: 700,
            fontSize: "14px",
            color: signal.ticker === "UNKNOWN" ? "#333" : "#fff",
            letterSpacing: "0.08em",
            minWidth: "52px",
          }}>
            {signal.ticker === "UNKNOWN" ? "—" : signal.ticker}
          </span>

          {/* Vertical divider */}
          <div style={{ width: "1px", height: "14px", background: "#1a1a1a", flexShrink: 0 }} />

          {/* Event type — plain English, not ALL CAPS JUNK */}
          <span style={{
            fontSize: "11px",
            color: "#444",
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: "0.03em",
          }}>
            {signal.event_type && !["ROUTINE_ADMIN", "UNKNOWN"].includes(signal.event_type)
              ? signal.event_type
                .replace(/_/g, " ")
                .replace(/\b\w/g, c => c.toUpperCase())
              : "Admin Filing"}
          </span>

          {/* Watched dot — subtle, not a badge */}
          {isWatched && (
            <div style={{
              width: "5px", height: "5px",
              borderRadius: "50%",
              background: "#0066FF",
              flexShrink: 0,
              title: "Watching",
            }} />
          )}

          <div style={{ flex: 1 }} />

          {/* Signal verdict — only show if not routine */}
          {!isRoutine && (
            <span style={{
              fontSize: "10px",
              padding: "3px 7px",
              background: cfg.bg,
              border: `1px solid ${cfg.color}30`,
              color: cfg.color,
              fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: "0.08em",
              fontWeight: 600,
            }}>
              {cfg.label}
            </span>
          )}

          {/* Impact label — replaces the useless number */}
          {(signal.impact_score || 0) >= 35 && (
            <span style={{
              fontSize: "10px",
              color: impact.color,
              fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: "0.06em",
            }}>
              {impact.label}
            </span>
          )}

          {/* Watch/unwatch — minimal */}
          {onToggleWatch && (
            <button
              onClick={e => { e.stopPropagation(); onToggleWatch(signal.ticker); }}
              style={{
                background: "none",
                border: "none",
                color: isWatched ? "#0066FF" : "#1e1e1e",
                cursor: "pointer",
                fontSize: "13px",
                padding: "0",
                lineHeight: 1,
                transition: "color 150ms",
              }}
              onMouseEnter={e => !isWatched && (e.currentTarget.style.color = "#444")}
              onMouseLeave={e => !isWatched && (e.currentTarget.style.color = "#1e1e1e")}
              title={isWatched ? "Stop watching" : "Watch this ticker"}
            >
              {isWatched ? "★" : "☆"}
            </button>
          )}
        </div>

        {/* ROW 2: Summary — plain English, dim if processing */}
        <p style={{
          margin: "0 0 8px",
          fontSize: "13px",
          color: isProcessing ? "#222" : "#777",
          lineHeight: 1.5,
          fontStyle: isProcessing ? "italic" : "normal",
        }}>
          {isProcessing
            ? "Processing filing..."
            : summary}
        </p>

        {/* ROW 3: Company + Time — minimum necessary */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{
            fontSize: "11px",
            color: "#2a2a2a",
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: "0.04em",
          }}>
            {signal.company_name?.replace(", Inc.", "").replace(", LLC", "").replace(" Inc.", "") || ""}
          </span>
          <span style={{ fontSize: "11px", color: "#2a2a2a", fontFamily: "'IBM Plex Mono', monospace" }}>
            {formatRelativeTime(signal.filed_at)}
          </span>
        </div>

      </div>
    </div>
  );
}
