// AlertCard.jsx — v3 Enriched signal card: Bloomberg-terminal style
// Shows: divergence detection, genome alerts, social sentiment, insider activity, congress trades
import { useState, useEffect } from 'react';

const FORM_COLORS = {
  '8-K': { bg: '#0066FF15', border: '#0066FF40', text: '#0066FF' },
  '10-K': { bg: '#F59E0B15', border: '#F59E0B40', text: '#F59E0B' },
  '10-Q': { bg: '#00C80515', border: '#00C80540', text: '#00C805' },
  '4': { bg: '#A855F715', border: '#A855F740', text: '#A855F7' },
  'SC 13D': { bg: '#FF6B0015', border: '#FF6B0040', text: '#FF6B00' },
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function AlertCard({ signal, isWatched, onToggleWatch, onClick, isNew, dimmed }) {
  const [shouldAnimate] = useState(isNew);
  const [relTime, setRelTime] = useState(timeAgo(signal.filed_at));

  useEffect(() => {
    const timer = setInterval(() => setRelTime(timeAgo(signal.filed_at)), 30000);
    return () => clearInterval(timer);
  }, [signal.filed_at]);

  const sigColor = signal.classification === 'Positive' ? '#00C805'
    : signal.classification === 'Risk' ? '#FF3333' : '#1a1a1a';
  const confColor = signal.classification === 'Positive' ? '#00C805'
    : signal.classification === 'Risk' ? '#FF3333' : '#555';
  const confidence = signal.confidence || 0;
  const confidenceBarColor = confidence > 80 ? '#00C805' : confidence >= 50 ? '#F59E0B' : '#FF3333';
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
        border: '1px solid #141414',
        borderLeft: `3px solid ${sigColor}`,
        background: '#0a0a0a',
        cursor: 'pointer',
        opacity: dimmed ? 0.55 : 1,
        transition: 'background 80ms, opacity 150ms, border-color 150ms',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = '#111111';
        e.currentTarget.style.borderLeftColor = '#0066FF';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = '#0a0a0a';
        e.currentTarget.style.borderLeftColor = sigColor;
      }}
    >
      {/* HEADER: Ticker + Filing Type + Signal Badge + Confidence + Impact */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <span data-testid={`card-ticker-${signal.ticker}`} style={{
          fontWeight: 700, fontSize: '14px', color: isWatched ? '#fff' : '#ccc',
          letterSpacing: '0.08em', fontFamily: "'JetBrains Mono', monospace",
        }}>
          {signal.ticker === 'UNKNOWN' ? '---' : signal.ticker}
        </span>

        {isWatched && (
          <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#0066FF' }} />
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
          background: signal.classification === 'Positive' ? '#00C80510' :
            signal.classification === 'Risk' ? '#FF333310' : '#1a1a1a10',
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
            color: (signal.impact_score || 0) >= 70 ? '#FF3333' : (signal.impact_score || 0) >= 50 ? '#FFB300' : '#444',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            IMP:{signal.impact_score}
          </span>
        )}
      </div>

      {/* Event type line */}
      {eventLabel && (
        <div style={{ fontSize: '9px', color: '#0066FF', letterSpacing: '0.04em', marginBottom: '6px', textTransform: 'capitalize' }}>
          {eventLabel.toLowerCase()}
        </div>
      )}

      {/* SUMMARY */}
      <p style={{
        margin: '0 0 8px', fontSize: '12px', color: dimmed ? '#333' : '#777', lineHeight: 1.5,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {signal.summary || 'Agent is analyzing filing...'}
      </p>

      {/* DIVERGENCE ROW */}
      {hasDivergence && (
        <div data-testid={`divergence-alert-${signal.id}`} style={{
          background: isCriticalDiv ? '#1a000010' : '#1a1a0010',
          borderLeft: `3px solid ${isCriticalDiv ? '#FF3333' : '#F59E0B'}`,
          padding: '8px 10px', marginBottom: '8px',
          border: `1px solid ${isCriticalDiv ? '#FF333330' : '#F59E0B30'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: isCriticalDiv ? '#FF3333' : '#F59E0B',
              fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em' }}>
              DIVERGENCE {divScore}/100
            </span>
            {isCriticalDiv && (
              <span style={{
                fontSize: '8px', fontWeight: 700, color: '#FF3333', background: '#FF333315',
                padding: '1px 5px', letterSpacing: '0.08em',
              }}>CRITICAL</span>
            )}
          </div>
          {signal.public_claim && (
            <div style={{ fontSize: '10px', color: '#555', marginBottom: '2px' }}>
              <span style={{ color: '#666', fontWeight: 600 }}>CEO said: </span>
              <span style={{ fontStyle: 'italic' }}>"{signal.public_claim}"</span>
            </div>
          )}
          {signal.filing_reality && (
            <div style={{ fontSize: '10px', color: '#555' }}>
              <span style={{ color: '#666', fontWeight: 600 }}>Filing says: </span>
              {signal.filing_reality}
            </div>
          )}
          {signal.contradiction_summary && !signal.public_claim && (
            <div style={{ fontSize: '10px', color: '#555' }}>{signal.contradiction_summary}</div>
          )}
        </div>
      )}

      {/* GENOME ALERT ROW */}
      {signal.genome_alert && (
        <div data-testid={`genome-alert-${signal.id}`} style={{
          background: '#0066FF08', borderLeft: '3px solid #0066FF',
          padding: '6px 10px', marginBottom: '8px',
          border: '1px solid #0066FF20',
        }}>
          <span style={{
            fontSize: '10px', fontWeight: 700, color: '#0066FF',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em',
          }}>
            GENOME ALERT
          </span>
          {signal.genome_pattern_matches && signal.genome_pattern_matches.length > 0 && (
            <span style={{ fontSize: '9px', color: '#444', marginLeft: '8px' }}>
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
            <span style={{ color: '#555' }}>
              Insider{' '}
              <span style={{ color: parseFloat(signal.insider_net_30d) > 0 ? '#00C805' : parseFloat(signal.insider_net_30d) < 0 ? '#FF3333' : '#333' }}>
                ${Math.abs(parseFloat(signal.insider_net_30d || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </span>
          )}
          {signal.congress_net_sentiment && signal.congress_net_sentiment !== 'NEUTRAL' && (
            <span style={{ color: '#555' }}>
              Congress{' '}
              <span style={{ color: signal.congress_net_sentiment === 'BUYING' ? '#00C805' : '#FF3333' }}>
                {signal.congress_net_sentiment}
              </span>
            </span>
          )}
          {signal.social_vs_filing_delta && signal.social_vs_filing_delta !== 'NEUTRAL' && (
            <span style={{ color: '#555' }}>
              Social{' '}
              <span style={{ color: signal.social_vs_filing_delta === 'ALIGNED_BULLISH' ? '#00C805' :
                signal.social_vs_filing_delta === 'ALIGNED_BEARISH' ? '#FF3333' :
                signal.social_vs_filing_delta === 'CONFLICTING' ? '#F59E0B' : '#444' }}>
                {signal.social_vs_filing_delta.replace(/_/g, ' ')}
              </span>
            </span>
          )}
        </div>
      )}

      {/* NEWS ROW */}
      {signal.news_headlines && signal.news_headlines.length > 0 && (
        <div style={{ fontSize: '10px', color: '#333', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ color: '#444', fontFamily: "'JetBrains Mono', monospace" }}>NEWS </span>
          {signal.news_headlines[0]?.headline || signal.news_headlines[0]}
          {signal.news_headlines[0]?.source && (
            <span style={{ color: '#222', marginLeft: '6px' }}>— {signal.news_headlines[0].source}</span>
          )}
        </div>
      )}

      {/* FOOTER: Time + Accession */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
        <span style={{ fontSize: '9px', color: '#222', fontFamily: "'JetBrains Mono', monospace" }}>
          {relTime}
        </span>
        {signal.accession_number && (
          <span style={{ fontSize: '8px', color: '#181818', fontFamily: "'JetBrains Mono', monospace" }}>
            {signal.accession_number}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {onToggleWatch && (
          <button
            onClick={e => { e.stopPropagation(); onToggleWatch(signal.ticker); }}
            data-testid={`watch-btn-${signal.ticker}`}
            style={{
              background: isWatched ? '#0066FF18' : 'transparent',
              border: `1px solid ${isWatched ? '#0066FF40' : '#1a1a1a'}`,
              cursor: 'pointer',
              color: isWatched ? '#0066FF' : '#222',
              fontSize: '10px', padding: '2px 6px',
              fontFamily: "'JetBrains Mono', monospace",
              transition: 'all 150ms',
            }}
          >
            {isWatched ? 'WATCHED' : 'WATCH'}
          </button>
        )}
      </div>

      {/* CONFIDENCE BAR — 3px solid line at bottom */}
      {confidence > 0 && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: '3px', background: '#111',
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
