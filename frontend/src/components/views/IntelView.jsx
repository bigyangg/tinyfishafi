// IntelView.jsx — Company dossier: genome, insider timeline, congress trades, signal history
import { useState } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function IntelView({ watchlist = [] }) {
  const [ticker, setTicker] = useState('');
  const [query, setQuery] = useState('');
  const [dossier, setDossier] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadDossier = async (t) => {
    const target = t || query.trim().toUpperCase();
    if (!target) return;
    setTicker(target);
    setLoading(true);
    try {
      const [intelRes, genomeRes] = await Promise.allSettled([
        axios.get(`${API}/intel/${target}`),
        axios.get(`${API}/genomes/${target}`),
      ]);
      const intel = intelRes.status === 'fulfilled' ? intelRes.value.data : {};
      const genome = genomeRes.status === 'fulfilled' ? genomeRes.value.data : null;
      setDossier({ ...intel, genome: intel.genome || genome });
    } catch {
      setDossier({ ticker: target, signals: [], genome: null, error: 'Failed to load' });
    } finally {
      setLoading(false);
    }
  };

  const trendColor = (trend) => {
    if (trend === 'IMPROVING') return '#00C805';
    if (trend === 'STABLE') return '#555';
    if (trend === 'DETERIORATING') return '#F59E0B';
    if (trend === 'CRITICAL') return '#FF3333';
    return '#333';
  };

  return (
    <div data-testid="intel-view" style={{ padding: '24px 20px' }}>
      <div style={{
        fontSize: '10px', color: '#333', letterSpacing: '0.12em', fontWeight: 600,
        fontFamily: "'JetBrains Mono', monospace", marginBottom: '16px',
      }}>
        INTEL — COMPANY DOSSIER
      </div>

      {/* Search bar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <input
          data-testid="intel-search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadDossier()}
          placeholder="Search any ticker... AAPL, TSLA, BA"
          style={{
            flex: 1, padding: '10px 14px', background: '#080808',
            border: '1px solid #1a1a1a', color: '#fff',
            fontFamily: "'JetBrains Mono', monospace", fontSize: '13px',
            outline: 'none',
          }}
        />
        <button
          data-testid="intel-search-btn"
          onClick={() => loadDossier()}
          style={{
            padding: '10px 20px', background: '#0066FF', border: 'none',
            color: '#fff', fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px', cursor: 'pointer', letterSpacing: '0.06em',
          }}
        >
          ANALYZE
        </button>
      </div>

      {/* Quick access from watchlist */}
      {watchlist.length > 0 && !dossier && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '9px', color: '#333', letterSpacing: '0.08em', marginBottom: '8px' }}>WATCHLIST</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {watchlist.map(t => (
              <button
                key={t}
                data-testid={`intel-watchlist-${t}`}
                onClick={() => { setQuery(t); loadDossier(t); }}
                style={{
                  padding: '6px 14px', background: '#0a0a0a', border: '1px solid #1a1a1a',
                  color: '#888', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px',
                  cursor: 'pointer', fontWeight: 600,
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#333', fontSize: '11px' }}>
          Loading intelligence for {ticker}...
        </div>
      )}

      {dossier && !loading && (
        <div>
          {/* Ticker header */}
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '28px', fontWeight: 700, color: '#fff', margin: '0 0 4px', fontFamily: "'JetBrains Mono', monospace" }}>
              {dossier.ticker}
            </h2>
            <div style={{ fontSize: '10px', color: '#444' }}>
              {dossier.signal_count || 0} signals tracked
            </div>
          </div>

          {/* Genome Card */}
          {dossier.genome && (
            <div style={{
              background: '#080808', border: '1px solid #141414', padding: '20px', marginBottom: '16px',
            }}>
              <div style={{
                fontSize: '10px', color: '#444', letterSpacing: '0.1em', fontWeight: 600, marginBottom: '16px',
              }}>
                REGULATORY GENOME
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                <div>
                  <div style={{
                    fontSize: '24px', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                    color: (dossier.genome.genome_score || 0) >= 65 ? '#FF3333' : '#fff',
                  }}>
                    {dossier.genome.genome_score || 0}
                  </div>
                  <div style={{ fontSize: '8px', color: '#333', letterSpacing: '0.08em' }}>SCORE</div>
                </div>
                <div>
                  <div style={{
                    fontSize: '14px', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                    color: trendColor(dossier.genome.genome_trend),
                  }}>
                    {dossier.genome.genome_trend || '--'}
                  </div>
                  <div style={{ fontSize: '8px', color: '#333', letterSpacing: '0.08em' }}>TREND</div>
                </div>
                <div>
                  <div style={{
                    fontSize: '14px', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                    color: dossier.genome.genome_alert ? '#FF3333' : '#00C805',
                  }}>
                    {dossier.genome.genome_alert ? 'YES' : 'NO'}
                  </div>
                  <div style={{ fontSize: '8px', color: '#333', letterSpacing: '0.08em' }}>ALERT</div>
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: '#888' }}>
                    {dossier.genome.filing_history_analyzed || 0}
                  </div>
                  <div style={{ fontSize: '8px', color: '#333', letterSpacing: '0.08em' }}>FILINGS</div>
                </div>
              </div>

              {/* Pattern matches */}
              {dossier.genome.pattern_matches && (() => {
                let matches = dossier.genome.pattern_matches;
                if (typeof matches === 'string') {
                  try { matches = JSON.parse(matches); } catch { matches = []; }
                }
                return matches.length > 0 ? (
                  <div style={{ marginTop: '16px', borderTop: '1px solid #111', paddingTop: '12px' }}>
                    <div style={{ fontSize: '9px', color: '#333', letterSpacing: '0.08em', marginBottom: '8px' }}>PATTERN MATCHES</div>
                    {matches.map((m, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                        <span style={{ fontSize: '10px', color: m.similarity >= 50 ? '#FF3333' : '#F59E0B', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
                          {m.similarity}%
                        </span>
                        <span style={{ fontSize: '10px', color: '#555' }}>{(m.pattern || '').replace(/_/g, ' ')}</span>
                        <span style={{ fontSize: '9px', color: '#222' }}>({m.historical_cases} historical cases)</span>
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {/* Signal History */}
          <div style={{ background: '#080808', border: '1px solid #141414', padding: '20px' }}>
            <div style={{
              fontSize: '10px', color: '#444', letterSpacing: '0.1em', fontWeight: 600, marginBottom: '12px',
            }}>
              SIGNAL HISTORY
            </div>
            {(dossier.signals || []).length === 0 ? (
              <div style={{ fontSize: '11px', color: '#222' }}>No signals found for this ticker.</div>
            ) : (
              dossier.signals.slice(0, 10).map((s, i) => {
                const sColor = s.classification === 'Positive' ? '#00C805' : s.classification === 'Risk' ? '#FF3333' : '#333';
                return (
                  <div key={s.id || i} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 0', borderBottom: '1px solid #0d0d0d',
                  }}>
                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: sColor }} />
                    <span style={{ fontSize: '11px', fontWeight: 600, color: sColor, fontFamily: "'JetBrains Mono', monospace", minWidth: '50px' }}>
                      {s.classification || 'Pending'}
                    </span>
                    <span style={{ fontSize: '10px', color: '#555', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.summary}
                    </span>
                    <span style={{ fontSize: '9px', color: '#222', fontFamily: "'JetBrains Mono', monospace" }}>
                      {s.confidence || 0}%
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
