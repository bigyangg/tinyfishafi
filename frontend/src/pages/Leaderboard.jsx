// Leaderboard.jsx — Divergence Leaderboard: Companies ranked by SAID vs FILED contradiction score
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SEVERITY_COLORS = {
  CRITICAL: { text: 'var(--signal-risk)', bg: 'var(--signal-risk-bg)', border: 'var(--signal-risk)' },
  HIGH:     { text: 'var(--filing-10k)', bg: 'rgba(251, 191, 36, 0.08)', border: 'rgba(251, 191, 36, 0.25)' },
  MODERATE: { text: 'var(--filing-sc13d)', bg: 'rgba(251, 146, 60, 0.08)', border: 'rgba(251, 146, 60, 0.25)' },
  LOW:      { text: 'var(--text-tertiary)',    bg: 'var(--bg-card)', border: 'var(--border-default)' },
};

function getSeverity(score) {
  if (score > 80) return 'CRITICAL';
  if (score > 60) return 'HIGH';
  if (score > 40) return 'MODERATE';
  return 'LOW';
}

export default function Leaderboard() {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/leaderboard/divergence`);
      const items = Array.isArray(res.data)
        ? res.data
        : (res.data.results || res.data.leaderboard || res.data.data || []);
      setData(items);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Leaderboard fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 60000);
    return () => clearInterval(timer);
  }, [fetchData]);

  return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        overflow: 'hidden', background: 'var(--bg-base)',
      }}>
        {/* HEADER */}
        <div style={{
          flexShrink: 0, background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-default)',
          padding: '14px 20px',
          display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <span style={{
            fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)',
            letterSpacing: '0.04em',
          }}>Divergence Leaderboard</span>
          <span style={{
            fontSize: '11px', color: 'var(--text-muted)',
          }}>{data.length} companies</span>
          <div style={{ flex: 1 }} />
          {lastRefresh && (
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
              Refreshes every 60s
            </span>
          )}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 10px',
            background: 'var(--signal-risk-bg)',
            border: '1px solid var(--signal-risk)',
            borderRadius: '4px',
          }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--signal-risk)', animation: 'pulse-green 2s ease-in-out infinite' }} />
            <span style={{ fontSize: '9px', color: 'var(--signal-risk)', letterSpacing: '0.06em', fontWeight: 600 }}>LIVE</span>
          </div>
        </div>

        {/* TABLE HEADER */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '50px 80px 1fr 90px 100px 1fr',
          gap: '8px',
          padding: '10px 20px',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--bg-surface)',
          fontSize: '9px', color: 'var(--text-muted)',
          letterSpacing: '0.1em', fontWeight: 600,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          <span>RANK</span>
          <span>TICKER</span>
          <span>COMPANY</span>
          <span>SCORE</span>
          <span>SEVERITY</span>
          <span>CONTRADICTION</span>
        </div>

        {/* TABLE BODY */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              {[1,2,3,4,5].map(i => (
                <div key={i} style={{
                  height: '56px', background: 'var(--bg-card)', margin: '4px 20px',
                  border: '1px solid var(--border-default)', borderRadius: '4px',
                  animation: 'shimmer 1.5s ease infinite',
                }} />
              ))}
            </div>
          )}

          {!loading && data.length === 0 && (
            <div style={{ padding: '60px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px', opacity: 0.3 }}>⚖</div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                No divergence signals detected yet
              </p>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Divergence is detected when a company's public statements contradict their SEC filings.
              </p>
              <p style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                Use the <span style={{ color: 'var(--accent-blue)' }}>Signal Trigger</span> in the sidebar to analyze a company.
              </p>
            </div>
          )}

          {!loading && data.map((item, i) => {
            const score = item.divergence_score || 0;
            const severity = item.divergence_severity || getSeverity(score);
            const sev = SEVERITY_COLORS[severity] || SEVERITY_COLORS.LOW;
            const isCritical = severity === 'CRITICAL';

            return (
              <div
                key={item.id || i}
                onClick={() => navigate(`/signal/${item.id}`)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '50px 80px 1fr 90px 100px 1fr',
                  gap: '8px',
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--border-default)',
                  background: isCritical ? 'var(--signal-risk-bg)' : 'var(--bg-base)',
                  cursor: 'pointer',
                  transition: 'background 80ms',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = isCritical ? '#FF333312' : '#0a0a0a';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = isCritical ? '#FF333308' : '#050505';
                }}
              >
                {/* Rank */}
                <span style={{
                  fontSize: '14px', fontWeight: 700,
                  color: i < 3 ? '#FF3333' : '#444',
                  fontFamily: "'JetBrains Mono', monospace",
                  alignSelf: 'center',
                }}>
                  #{i + 1}
                </span>

                {/* Ticker */}
                <span style={{
                  fontSize: '13px', fontWeight: 700, color: '#fff',
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: '0.06em',
                  alignSelf: 'center',
                }}>
                  {item.ticker || '---'}
                </span>

                {/* Company */}
                <div style={{ alignSelf: 'center', minWidth: 0 }}>
                  <div style={{
                    fontSize: '12px', color: '#888',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {item.company || '—'}
                  </div>
                  <div style={{ fontSize: '9px', color: '#333', marginTop: '2px' }}>
                    {item.filing_type || '8-K'}
                  </div>
                </div>

                {/* Score bar */}
                <div style={{ alignSelf: 'center' }}>
                  <div style={{
                    fontSize: '14px', fontWeight: 700,
                    color: sev.text,
                    fontFamily: "'JetBrains Mono', monospace",
                    marginBottom: '4px',
                  }}>
                    {score}
                  </div>
                  <div style={{
                    height: '3px', width: '100%',
                    background: '#1a1a1a', borderRadius: '2px',
                  }}>
                    <div style={{
                      height: '100%', width: `${score}%`,
                      background: sev.text,
                      borderRadius: '2px',
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>

                {/* Severity badge */}
                <div style={{ alignSelf: 'center' }}>
                  <span style={{
                    fontSize: '9px', fontWeight: 700,
                    color: sev.text,
                    background: sev.bg,
                    border: `1px solid ${sev.border}`,
                    padding: '3px 8px',
                    letterSpacing: '0.08em',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {severity}
                  </span>
                </div>

                {/* Contradiction detail */}
                <div style={{ alignSelf: 'center', minWidth: 0 }}>
                  {item.public_claim && (
                    <div style={{
                      fontSize: '10px', color: '#555', marginBottom: '3px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      <span style={{ color: '#666', fontWeight: 600 }}>SAID: </span>
                      <span style={{ fontStyle: 'italic' }}>"{item.public_claim}"</span>
                    </div>
                  )}
                  {item.filing_reality && (
                    <div style={{
                      fontSize: '10px', color: '#555',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      <span style={{ color: '#666', fontWeight: 600 }}>FILED: </span>
                      {item.filing_reality}
                    </div>
                  )}
                  {!item.public_claim && !item.filing_reality && item.contradiction_summary && (
                    <div style={{
                      fontSize: '10px', color: '#444',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {item.contradiction_summary}
                    </div>
                  )}
                  {!item.public_claim && !item.filing_reality && !item.contradiction_summary && (
                    <span style={{ fontSize: '10px', color: '#222' }}>—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
  );
}
