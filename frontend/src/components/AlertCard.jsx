// AlertCard.jsx — Compact 3-column card for categorized feed
import { useState, useEffect } from 'react';

export default function AlertCard({ signal, isWatched, onToggleWatch, onClick, isNew, dimmed }) {
  // Live relative timestamps
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const sigColor = signal.classification === 'Positive' ? '#00C805'
    : signal.classification === 'Risk' ? '#FF3333'
      : '#1a1a1a';

  const impactColor = (signal.impact_score || 0) >= 70 ? '#FF3333'
    : (signal.impact_score || 0) >= 50 ? '#FFB300'
      : '#1e1e1e';

  const eventLabel = signal.event_type && signal.event_type !== 'ROUTINE_ADMIN'
    ? signal.event_type.replace(/_/g, ' ')
    : 'Admin 8-K';

  return (
    <div
      onClick={() => onClick && onClick(signal)}
      className={isNew ? 'signal-enter' : ''}
      data-testid={`alert-card-${signal.id}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '90px 1fr auto',
        alignItems: 'start',
        gap: '12px',
        padding: '12px 16px',
        margin: '3px 8px',
        borderRadius: '4px',
        border: '1px solid #141414',
        borderLeft: `3px solid ${sigColor}`,
        background: '#0a0a0a',
        cursor: 'pointer',
        opacity: dimmed ? 0.55 : 1,
        transition: 'background 80ms, opacity 150ms, border-color 150ms',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#111'; e.currentTarget.style.borderColor = '#1e1e1e'; if (dimmed) e.currentTarget.style.opacity = '0.75'; }}
      onMouseLeave={e => { e.currentTarget.style.background = '#0a0a0a'; e.currentTarget.style.borderColor = '#141414'; if (dimmed) e.currentTarget.style.opacity = '0.55'; }}
    >
      {/* LEFT: Ticker + event */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
          <span style={{
            fontWeight: 700,
            fontSize: '13px',
            color: isWatched ? '#fff' : '#ccc',
            letterSpacing: '0.08em',
          }}>
            {signal.ticker === 'UNKNOWN' ? '—' : signal.ticker}
          </span>
          {isWatched && (
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#0066FF', flexShrink: 0 }} />
          )}
        </div>
        <div style={{ fontSize: '9px', color: '#2a2a2a', letterSpacing: '0.04em' }}>
          {eventLabel}
        </div>
      </div>

      {/* CENTER: Summary + company */}
      <div>
        <p style={{
          margin: 0,
          fontSize: '12px',
          color: dimmed ? '#333' : '#777',
          lineHeight: 1.45,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {signal.summary || 'Agent is analyzing filing...'}
        </p>
        <div style={{ marginTop: '5px', fontSize: '9px', color: '#1e1e1e' }}>
          {signal.company_name || signal.company || ''}
        </div>
      </div>

      {/* RIGHT: Score + time + watch */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', minWidth: '56px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '10px', color: '#222' }}>
            {signal.filed_at
              ? new Date(signal.filed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '—'}
          </span>
          {onToggleWatch && (
            <button
              onClick={e => { e.stopPropagation(); onToggleWatch(signal.ticker); }}
              style={{
                width: '16px', height: '16px',
                background: isWatched ? '#0066FF18' : 'transparent',
                border: `1px solid ${isWatched ? '#0066FF40' : '#1a1a1a'}`,
                borderRadius: '2px',
                cursor: 'pointer',
                color: isWatched ? '#0066FF' : '#222',
                fontSize: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                transition: 'all 150ms',
                padding: 0,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {isWatched ? '★' : '+'}
            </button>
          )}
        </div>

        {/* Impact bar */}
        {(signal.impact_score || 0) > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '28px', height: '1px', background: '#111' }}>
              <div style={{
                height: '100%',
                width: `${signal.impact_score}%`,
                background: impactColor,
              }} />
            </div>
            <span style={{ fontSize: '9px', color: impactColor, minWidth: '16px', textAlign: 'right' }}>
              {signal.impact_score}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
