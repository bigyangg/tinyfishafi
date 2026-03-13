// AlertCard.jsx — Enhanced card with filing type badge and confidence display
import { useState, useEffect } from 'react';

// Filing type colors
const FORM_COLORS = {
  '8-K': { bg: '#0066FF15', border: '#0066FF40', text: '#0066FF' },
  '10-K': { bg: '#F59E0B15', border: '#F59E0B40', text: '#F59E0B' },
  '10-Q': { bg: '#00C80515', border: '#00C80540', text: '#00C805' },
  '4': { bg: '#A855F715', border: '#A855F740', text: '#A855F7' },
  'SC 13D': { bg: '#FF6B0015', border: '#FF6B0040', text: '#FF6B00' },
};

export default function AlertCard({ signal, isWatched, onToggleWatch, onClick, isNew, dimmed }) {
  // Only trigger the "new" animation once per component mount, not every time the parent re-renders
  const [shouldAnimate] = useState(isNew);

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
    : null;

  const filingType = signal.filing_type || '8-K';
  const formStyle = FORM_COLORS[filingType] || FORM_COLORS['8-K'];
  const confidence = signal.confidence || 0;

  // Confidence color matches signal classification
  const confColor = signal.classification === 'Positive' ? '#00C805'
    : signal.classification === 'Risk' ? '#FF3333'
      : '#555';

  return (
    <div
      onClick={() => onClick && onClick(signal)}
      className={shouldAnimate ? 'signal-enter' : ''}
      data-testid={`alert-card-${signal.id}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '100px 1fr auto',
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
      {/* LEFT: Ticker + filing type badge + event */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
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

        {/* Filing type badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '8px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: formStyle.text,
            background: formStyle.bg,
            border: `1px solid ${formStyle.border}`,
            padding: '1px 5px',
            borderRadius: '2px',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {filingType}
          </span>
          {eventLabel && (
            <span style={{
              fontSize: '8px',
              color: '#333',
              letterSpacing: '0.04em',
              textTransform: 'capitalize',
            }}>
              {eventLabel.toLowerCase()}
            </span>
          )}
        </div>
      </div>

      {/* CENTER: Summary + company + intelligence */}
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

        {/* WHY line — first key fact */}
        {signal.key_facts?.[0] && (
          <div style={{
            marginTop: '5px', fontSize: '9px', fontFamily: "'JetBrains Mono', monospace",
            display: 'flex', gap: '6px'
          }}>
            <span style={{ color: '#0066FF', flexShrink: 0 }}>WHY</span>
            <span style={{ color: '#2a2a2a' }}>{signal.key_facts[0]}</span>
          </div>
        )}

        {/* News divergence badge */}
        {signal.news_sentiment && !signal.sentiment_match && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '2px 7px', marginTop: '5px',
            background: '#FF6B0010', border: '1px solid #FF6B0030', borderRadius: '2px'
          }}>
            <span style={{
              fontSize: '8px', color: '#FF6B00',
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em'
            }}>
              NEWS DIVERGENCE
            </span>
          </div>
        )}

        {/* Insider transaction amounts (Form 4) */}
        {['INSIDER_BUY', 'INSIDER_SELL'].includes(signal.event_type)
          && signal.form_data?.insider && (
            <div style={{
              marginTop: '8px', display: 'flex', gap: '16px',
              padding: '7px 10px', background: '#060606', border: '1px solid #0d0d0d', borderRadius: '3px'
            }}>
              {[
                { l: 'TYPE', v: signal.form_data.insider.transaction_type === 'Purchase' ? 'BOUGHT' : 'SOLD', c: '#A855F7' },
                { l: 'VALUE', v: `$${((signal.form_data.insider.total_value_usd || 0) / 1e6).toFixed(1)}M`, c: '#fff' },
                { l: 'ROLE', v: signal.form_data.insider.role || '—', c: '#888' },
              ].map(({ l, v, c }) => (
                <div key={l}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: c, fontFamily: "'JetBrains Mono', monospace" }}>{v}</div>
                  <div style={{ fontSize: '8px', color: '#1e1e1e' }}>{l}</div>
                </div>
              ))}
            </div>
          )}

        {/* Deep link into specific Pipeline execution run Logs */}
        {signal.run_id && (
          <div style={{ marginTop: '10px' }}>
            <button
              onClick={(e) => { e.stopPropagation(); window.open(`/logs?run=${signal.run_id}`, '_blank'); }}
              style={{
                background: 'transparent', border: 'none', padding: 0,
                fontSize: '9px', color: '#0066FF', fontFamily: "'JetBrains Mono', monospace",
                cursor: 'pointer', letterSpacing: '0.06em', transition: 'color 150ms'
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#3388FF'}
              onMouseLeave={e => e.currentTarget.style.color = '#0066FF'}
            >
              VIEW RUN LOG ↗
            </button>
          </div>
        )}
      </div>

      {/* RIGHT: Confidence + time + watch */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', minWidth: '60px' }}>
        {/* Confidence score */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{
            fontSize: '14px',
            fontWeight: 700,
            color: dimmed ? '#222' : confColor,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '-0.02em',
          }}>
            {confidence > 0 ? confidence : '—'}
          </span>
          <span style={{
            fontSize: '7px',
            color: '#222',
            letterSpacing: '0.06em',
          }}>
            /100
          </span>
        </div>

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
            <div style={{ width: '28px', height: '2px', background: '#111', borderRadius: '1px' }}>
              <div style={{
                height: '100%',
                width: `${signal.impact_score}%`,
                background: impactColor,
                borderRadius: '1px',
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
