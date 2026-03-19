import { useState, useEffect } from 'react';
import { useAppData } from '../context/AppDataContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function Radar() {
  const { signals: contextSignals } = useAppData();
  const [weekBuckets, setWeekBuckets] = useState([]);
  const [allSignals, setAllSignals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const buildWeek = async () => {
      try {
        const r = await fetch(`${BACKEND_URL}/api/signals?limit=200`);
        const fetched = await r.json();
        const signals = Array.isArray(fetched) ? fetched : (fetched.signals || []);
        setAllSignals(signals);

        // Build Mon-Fri of current week
        const today = new Date();
        const currentDay = today.getDay(); // 0=Sun
        const monday = new Date(today);
        monday.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
        monday.setHours(0, 0, 0, 0);

        const buckets = [];
        for (let i = 0; i < 5; i++) {
          const day = new Date(monday);
          day.setDate(monday.getDate() + i);
          day.setHours(0, 0, 0, 0);
          buckets.push({ date: day, signals: [] });
        }

        signals.forEach(sig => {
          const raw = sig.filed_at || sig.created_at;
          if (!raw) return;
          const d = new Date(raw);
          d.setHours(0, 0, 0, 0);
          const bucket = buckets.find(b => b.date.toDateString() === d.toDateString());
          if (bucket) bucket.signals.push(sig);
        });

        setWeekBuckets(buckets);
        setLoading(false);
      } catch (e) {
        console.error('Radar fetch failed:', e);
        // Fallback: use context signals
        const signals = contextSignals || [];
        setAllSignals(signals);
        const today = new Date();
        const currentDay = today.getDay();
        const monday = new Date(today);
        monday.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
        monday.setHours(0, 0, 0, 0);
        const buckets = [];
        for (let i = 0; i < 5; i++) {
          const day = new Date(monday);
          day.setDate(monday.getDate() + i);
          day.setHours(0, 0, 0, 0);
          buckets.push({ date: day, signals: [] });
        }
        signals.forEach(sig => {
          const raw = sig.filed_at || sig.created_at;
          if (!raw) return;
          const d = new Date(raw);
          d.setHours(0, 0, 0, 0);
          const bucket = buckets.find(b => b.date.toDateString() === d.toDateString());
          if (bucket) bucket.signals.push(sig);
        });
        setWeekBuckets(buckets);
        setLoading(false);
      }
    };
    buildWeek();
  }, [contextSignals]);

  const isToday = (date) => {
    const t = new Date();
    return date.toDateString() === t.toDateString();
  };

  const sigColor = (sig) =>
    (sig.signal === 'Positive' || sig.classification === 'Positive') ? 'var(--signal-positive)'
    : (sig.signal === 'Risk' || sig.classification === 'Risk') ? 'var(--signal-risk)'
    : 'var(--border-strong)';

  const sigLabel = (sig) => sig.signal || sig.classification || 'Neutral';

  if (loading) {
    return (
      <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 12, fontFamily: 'monospace' }}>
        Loading radar...
      </div>
    );
  }

  const recentActivity = [...allSignals]
    .sort((a, b) => new Date(b.created_at || b.filed_at) - new Date(a.created_at || a.filed_at))
    .slice(0, 20);

  return (
    <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
      {/* Header */}
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
        letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20,
        fontFamily: 'monospace',
      }}>
        RADAR — THIS WEEK
      </div>

      {/* Day columns */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 8,
        marginBottom: 32,
      }}>
        {weekBuckets.map((bucket, i) => {
          const { date, signals } = bucket;
          const today = isToday(date);
          return (
            <div key={i} style={{
              background: today ? 'rgba(0,102,255,0.06)' : 'var(--bg-card)',
              border: `1px solid ${today ? 'var(--accent-blue-border)' : 'var(--border-default)'}`,
              borderRadius: 8,
              padding: 12,
              minHeight: 200,
            }}>
              {/* Day header */}
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: 10,
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: today ? 'var(--accent-blue)' : 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  fontFamily: 'monospace',
                }}>
                  {DAY_NAMES[i]}
                </span>
                <span style={{
                  fontSize: 13, fontWeight: 700,
                  fontFamily: 'monospace',
                  color: today ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}>
                  {date.getDate()}
                </span>
              </div>

              {/* Signal count badge */}
              {signals.length > 0 && (
                <div style={{
                  fontSize: 9, fontWeight: 700,
                  padding: '2px 6px', borderRadius: 3,
                  background: 'var(--bg-hover)',
                  color: 'var(--text-secondary)',
                  marginBottom: 8, display: 'inline-block',
                  fontFamily: 'monospace',
                }}>
                  {signals.length} filing{signals.length !== 1 ? 's' : ''}
                </div>
              )}

              {/* Signal mini-cards */}
              {signals.slice(0, 6).map((sig, j) => (
                <div key={j} style={{
                  padding: '5px 7px',
                  marginBottom: 4,
                  borderRadius: 4,
                  background: 'var(--bg-surface, var(--bg-card))',
                  border: '1px solid var(--border-default)',
                  borderLeft: `2px solid ${sigColor(sig)}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 800,
                      fontFamily: 'monospace', color: 'var(--text-primary)',
                    }}>
                      {sig.ticker === 'UNKNOWN' ? '---' : sig.ticker}
                    </span>
                    <span style={{
                      fontSize: 9, fontFamily: 'monospace',
                      color: sigColor(sig),
                    }}>
                      {sig.confidence || 0}%
                    </span>
                  </div>
                  <div style={{
                    fontSize: 9, color: 'var(--text-muted)',
                    marginTop: 1, fontFamily: 'monospace',
                  }}>
                    {sig.filing_type} · {(sig.event_type || '').replace(/_/g, ' ')}
                  </div>
                </div>
              ))}

              {signals.length > 6 && (
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4, textAlign: 'center' }}>
                  +{signals.length - 6} more
                </div>
              )}

              {signals.length === 0 && (
                <div style={{
                  fontSize: 10, color: 'var(--text-muted)',
                  textAlign: 'center', marginTop: 40, fontStyle: 'italic',
                }}>
                  {today ? 'Monitoring...' : 'No filings'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Recent Activity */}
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
        letterSpacing: '0.1em', textTransform: 'uppercase',
        marginBottom: 14, fontFamily: 'monospace',
      }}>
        RECENT ACTIVITY
      </div>

      {recentActivity.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          No signals yet — pipeline is running.
        </div>
      )}

      {recentActivity.map((sig, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 12px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 6, marginBottom: 6,
        }}>
          <span style={{
            fontSize: 13, fontWeight: 800,
            fontFamily: 'monospace', color: 'var(--text-primary)', minWidth: 48,
          }}>
            {sig.ticker === 'UNKNOWN' ? '---' : sig.ticker}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700,
            padding: '1px 6px', borderRadius: 3,
            background: 'var(--bg-hover)', color: 'var(--text-secondary)',
            fontFamily: 'monospace',
          }}>
            {sig.filing_type}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>
            {(sig.event_type || '').replace(/_/g, ' ') || (sig.summary || '').slice(0, 60)}
          </span>
          <span style={{
            fontSize: 10, color: sigColor(sig),
            fontFamily: 'monospace', fontWeight: 700,
          }}>
            {sigLabel(sig)}
          </span>
          <span style={{
            fontSize: 9, color: 'var(--text-muted)',
            fontFamily: 'monospace', minWidth: 60, textAlign: 'right',
          }}>
            {timeAgo(sig.created_at || sig.filed_at)}
          </span>
        </div>
      ))}
    </div>
  );
}
