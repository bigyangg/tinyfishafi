// AlertCard.jsx — v3 Enriched signal card: Bloomberg-terminal style
// Shows: divergence detection, genome alerts, social sentiment, insider activity, congress trades
import React, { useState, useEffect } from 'react';
import RippleDrawer from './RippleDrawer';

// Note: FORM_COLORS use CSS variables via computed styles
const FORM_COLORS = {
  '8-K': { bg: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.25)', text: 'var(--filing-8k)' },
  '10-K': { bg: 'rgba(251, 191, 36, 0.08)', border: 'rgba(251, 191, 36, 0.25)', text: 'var(--filing-10k)' },
  '10-Q': { bg: 'rgba(52, 211, 153, 0.08)', border: 'rgba(52, 211, 153, 0.25)', text: 'var(--filing-10q)' },
  '4': { bg: 'rgba(192, 132, 252, 0.08)', border: 'rgba(192, 132, 252, 0.25)', text: 'var(--filing-form4)' },
  'SC 13D': { bg: 'rgba(251, 146, 60, 0.08)', border: 'rgba(251, 146, 60, 0.25)', text: 'var(--filing-sc13d)' },
  'S-1': { bg: 'rgba(34, 211, 238, 0.08)', border: 'rgba(34, 211, 238, 0.25)', text: 'var(--filing-s1)' },
  'S-1/A': { bg: 'rgba(34, 211, 238, 0.08)', border: 'rgba(34, 211, 238, 0.25)', text: 'var(--filing-s1)' },
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function AlertCard({ signal, isWatched, onToggleWatch, onClick, isNew, dimmed }) {
  const [shouldAnimate] = useState(isNew);
  const [relTime, setRelTime] = useState(timeAgo(signal.filed_at));

  useEffect(() => {
    const timer = setInterval(() => setRelTime(timeAgo(signal.filed_at)), 30000);
    return () => clearInterval(timer);
  }, [signal.filed_at]);

  const sigColor = signal.classification === 'Positive' ? 'var(--signal-positive)'
    : signal.classification === 'Risk' ? 'var(--signal-risk)' : 'var(--border-default)';
  const confColor = signal.classification === 'Positive' ? 'var(--signal-positive)'
    : signal.classification === 'Risk' ? 'var(--signal-risk)' : 'var(--text-muted)';
  const confidence = signal.confidence || 0;
  const confidenceBarColor = confidence > 80 ? 'var(--signal-positive)' : confidence >= 50 ? 'var(--filing-10k)' : 'var(--signal-risk)';
  const filingType = signal.filing_type || '8-K';
  const formStyle = FORM_COLORS[filingType] || FORM_COLORS['8-K'];
  const eventLabel = signal.event_type && signal.event_type !== 'ROUTINE_ADMIN'
    ? signal.event_type.replace(/_/g, ' ') : null;
  const divScore = signal.divergence_score || 0;
  const hasDivergence = divScore > 60;
  const isCriticalDiv = divScore > 80;

  return (
    <div
      onClick={() => onClick && onClick(signal)}
      className={shouldAnimate ? 'signal-enter' : ''}
      data-testid={`alert-card-${signal.id}`}
      style={{
        position: 'relative',
        padding: '14px 16px 10px',
        margin: '3px 8px',
        border: '1px solid var(--border-default)',
        borderLeft: `3px solid ${sigColor}`,
        background: 'var(--bg-card)',
        cursor: 'pointer',
        opacity: dimmed ? 0.55 : 1,
        transition: 'background 80ms, opacity 150ms, border-color 150ms',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--bg-hover)';
        e.currentTarget.style.borderLeftColor = 'var(--accent-blue)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'var(--bg-card)';
        e.currentTarget.style.borderLeftColor = sigColor;
      }}
    >
      {/* HEADER: Ticker + Filing Type + Signal Badge + Confidence + Impact */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <span data-testid={`card-ticker-${signal.ticker}`} style={{
          fontWeight: 700, fontSize: '14px', color: isWatched ? 'var(--text-primary)' : 'var(--text-secondary)',
          letterSpacing: '0.08em', fontFamily: "'JetBrains Mono', monospace",
        }}>
          {signal.ticker === 'UNKNOWN' ? '---' : signal.ticker}
        </span>

        {isWatched && (
          <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--accent-blue)' }} />
        )}

        <span style={{
          fontSize: '8px', fontWeight: 700, letterSpacing: '0.08em',
          color: formStyle.text, background: formStyle.bg,
          border: `1px solid ${formStyle.border}`, padding: '1px 5px',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {filingType}
        </span>

        {/* Signal badge */}
        <span style={{
          fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em',
          color: sigColor, padding: '1px 6px',
          background: signal.classification === 'Positive' ? 'var(--signal-positive-bg)' :
            signal.classification === 'Risk' ? 'var(--signal-risk-bg)' : 'var(--border-default)',
          border: `1px solid ${sigColor}30`,
        }}>
          {signal.classification || 'PENDING'}
        </span>

        <div style={{ flex: 1 }} />

        {/* Confidence */}
        <span style={{
          fontSize: '13px', fontWeight: 700, color: dimmed ? '#222' : confColor,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {confidence > 0 ? `${confidence}%` : '--'}
        </span>

        {/* Impact Score */}
        {(signal.impact_score || 0) > 0 && (
          <span style={{
            fontSize: '10px', fontWeight: 600,
            color: (signal.impact_score || 0) >= 70 ? 'var(--signal-risk)' : (signal.impact_score || 0) >= 50 ? 'var(--filing-10k)' : 'var(--text-tertiary)',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            IMP:{signal.impact_score}
          </span>
        )}
      </div>

      {/* Event type line */}
      {eventLabel && (
        <div style={{ fontSize: '9px', color: 'var(--accent-blue)', letterSpacing: '0.04em', marginBottom: '6px', textTransform: 'capitalize' }}>
          {eventLabel.toLowerCase()}
        </div>
      )}

      {/* SUMMARY */}
      <p style={{
        margin: '0 0 8px', fontSize: '12px', color: dimmed ? 'var(--text-muted)' : 'var(--text-secondary)', lineHeight: 1.5,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {signal.summary || 'Agent is analyzing filing...'}
      </p>

      {/* DIVERGENCE ROW */}
      {hasDivergence && (
        <div data-testid={`divergence-alert-${signal.id}`} style={{
          background: isCriticalDiv ? 'var(--signal-risk-bg)' : 'rgba(251, 191, 36, 0.08)',
          borderLeft: `3px solid ${isCriticalDiv ? 'var(--signal-risk)' : 'var(--filing-10k)'}`,
          padding: '8px 10px', marginBottom: '8px',
          border: `1px solid ${isCriticalDiv ? 'var(--signal-risk)' : 'var(--filing-10k)'}30`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: isCriticalDiv ? 'var(--signal-risk)' : 'var(--filing-10k)',
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em' }}>
              DIVERGENCE {divScore}/100
            </span>
            {isCriticalDiv && (
              <span style={{
                fontSize: '8px', fontWeight: 700, color: 'var(--signal-risk)', background: 'var(--signal-risk-bg)',
                padding: '1px 5px', letterSpacing: '0.08em',
              }}>CRITICAL</span>
            )}
          </div>
          {signal.public_claim && (
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>CEO said: </span>
              <span style={{ fontStyle: 'italic' }}>"{signal.public_claim}"</span>
            </div>
          )}
          {signal.filing_reality && (
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Filing says: </span>
              {signal.filing_reality}
            </div>
          )}
          {signal.contradiction_summary && !signal.public_claim && (
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{signal.contradiction_summary}</div>
          )}
        </div>
      )}

      {/* GENOME ALERT ROW */}
      {signal.genome_alert && (
        <div data-testid={`genome-alert-${signal.id}`} style={{
          background: 'rgba(59, 130, 246, 0.08)', borderLeft: '3px solid var(--accent-blue)',
          padding: '6px 10px', marginBottom: '8px',
          border: '1px solid var(--accent-blue)20',
        }}>
          <span style={{
            fontSize: '10px', fontWeight: 700, color: 'var(--accent-blue)',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em',
          }}>
            GENOME ALERT
          </span>
          {signal.genome_pattern_matches && signal.genome_pattern_matches.length > 0 && (
            <span style={{ fontSize: '9px', color: 'var(--text-tertiary)', marginLeft: '8px' }}>
              {signal.genome_pattern_matches[0]?.pattern?.replace(/_/g, ' ')} — {signal.genome_pattern_matches[0]?.similarity}% match
            </span>
          )}
        </div>
      )}

      {/* DATA ROW: Insider + Congress + Social */}
      {(signal.insider_net_30d || signal.congress_net_sentiment || signal.social_vs_filing_delta) && (
        <div style={{
          display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '6px',
          fontSize: '10px', fontFamily: "'JetBrains Mono', monospace",
        }}>
          {signal.insider_net_30d !== null && signal.insider_net_30d !== undefined && (
            <span style={{ color: 'var(--text-muted)' }}>
              Insider{' '}
              <span style={{ color: parseFloat(signal.insider_net_30d) > 0 ? 'var(--signal-positive)' : parseFloat(signal.insider_net_30d) < 0 ? 'var(--signal-risk)' : 'var(--text-muted)' }}>
                ${Math.abs(parseFloat(signal.insider_net_30d || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </span>
          )}
          {signal.congress_net_sentiment && signal.congress_net_sentiment !== 'NEUTRAL' && (
            <span style={{ color: 'var(--text-muted)' }}>
              Congress{' '}
              <span style={{ color: signal.congress_net_sentiment === 'BUYING' ? 'var(--signal-positive)' : 'var(--signal-risk)' }}>
                {signal.congress_net_sentiment}
              </span>
            </span>
          )}
          {signal.social_vs_filing_delta && signal.social_vs_filing_delta !== 'NEUTRAL' && (
            <span style={{ color: 'var(--text-muted)' }}>
              Social{' '}
              <span style={{ color: signal.social_vs_filing_delta === 'ALIGNED_BULLISH' ? 'var(--signal-positive)' :
                signal.social_vs_filing_delta === 'ALIGNED_BEARISH' ? 'var(--signal-risk)' :
                signal.social_vs_filing_delta === 'CONFLICTING' ? 'var(--filing-10k)' : 'var(--text-tertiary)' }}>
                {signal.social_vs_filing_delta.replace(/_/g, ' ')}
              </span>
            </span>
          )}
        </div>
      )}

      {/* NEWS ROW */}
      {signal.news_headlines && signal.news_headlines.length > 0 && (
        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>NEWS </span>
          {signal.news_headlines[0]?.headline || signal.news_headlines[0]}
          {signal.news_headlines[0]?.source && (
            <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>— {signal.news_headlines[0].source}</span>
          )}
        </div>
      )}

      {/* FOOTER: Time + Accession */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
        <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
          {relTime}
        </span>
        {signal.accession_number && (
          <span style={{ fontSize: '8px', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
            {signal.accession_number}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {onToggleWatch && (
          <button
            onClick={e => { e.stopPropagation(); onToggleWatch(signal.ticker); }}
            data-testid={`watch-btn-${signal.ticker}`}
            style={{
              background: isWatched ? 'var(--accent-blue-bg)' : 'transparent',
              border: `1px solid ${isWatched ? 'var(--accent-blue-border)' : 'var(--border-default)'}`,
              cursor: 'pointer',
              color: isWatched ? 'var(--accent-blue)' : 'var(--text-tertiary)',
              fontSize: '10px', padding: '2px 6px',
              fontFamily: "'JetBrains Mono', monospace",
              transition: 'all 150ms',
            }}
          >
            {isWatched ? 'WATCHED' : 'WATCH'}
          </button>
        )}
      </div>
      {/* RIPPLE DRAWER */}
      <div onClick={e => e.stopPropagation()} style={{ padding: '2px 0' }}>
        <RippleDrawer signalId={signal.id} />
      </div>

      {/* CONFIDENCE BAR — 3px solid line at bottom */}
      {confidence > 0 && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: '3px', background: 'var(--border-default)',
        }}>
          <div style={{
            height: '100%', width: `${confidence}%`,
            background: confidenceBarColor,
            transition: 'width 0.5s ease',
          }} />
        </div>
      )}
    </div>
  );
}

export default React.memo(AlertCard, (prevProps, nextProps) => {
  return (
    prevProps.signal.id === nextProps.signal.id &&
    prevProps.signal.user_correction === nextProps.signal.user_correction &&
    prevProps.signal.impact_score === nextProps.signal.impact_score &&
    prevProps.isWatched === nextProps.isWatched &&
    prevProps.isNew === nextProps.isNew &&
    prevProps.dimmed === nextProps.dimmed
  );
});
