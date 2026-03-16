// BriefView.jsx — AI-generated personalized brief: Top events from last 24h
import { useState, useEffect } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function BriefView({ authHeaders }) {
  const [brief, setBrief] = useState('');
  const [loading, setLoading] = useState(true);
  const [signalCount, setSignalCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API}/brief`);
        setBrief(res.data.brief || '');
        setSignalCount(res.data.signal_count || 0);
      } catch {
        setBrief('Unable to generate brief at this time.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div data-testid="brief-view" style={{ padding: '40px 32px', maxWidth: '680px', margin: '0 auto' }}>
      <div style={{
        fontSize: '10px', color: '#333', letterSpacing: '0.12em', fontWeight: 600,
        fontFamily: "'JetBrains Mono', monospace", marginBottom: '24px',
      }}>
        DAILY BRIEF
      </div>

      <h2 style={{
        fontSize: '20px', fontWeight: 300, color: '#aaa', margin: '0 0 32px',
        lineHeight: 1.5,
      }}>
        {greeting}. {signalCount > 0
          ? `${signalCount} events in your portfolio since yesterday.`
          : 'No new events detected yet.'}
      </h2>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[100, 85, 65].map((w, i) => (
            <div key={i} style={{
              height: '10px', width: `${w}%`, background: '#111',
              animation: `shimmer 1.5s ${i * 0.15}s ease infinite`,
            }} />
          ))}
        </div>
      ) : brief ? (
        <div style={{
          background: '#080808', border: '1px solid #141414',
          padding: '24px', position: 'relative',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '3px', height: '100%', background: '#0066FF' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingLeft: '12px' }}>
            {brief.split(/(?<=[.!?])\s+/).slice(0, 4).map((sentence, i) => (
              <p key={i} style={{
                margin: 0,
                fontSize: i === 0 ? '14px' : '12px',
                color: i === 0 ? '#ddd' : '#666',
                lineHeight: 1.7,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {sentence}
              </p>
            ))}
          </div>
        </div>
      ) : (
        <p style={{ fontSize: '12px', color: '#333' }}>No intelligence available yet. The EDGAR agent is monitoring for new filings.</p>
      )}

      <div style={{
        marginTop: '40px', padding: '16px',
        background: '#060606', border: '1px solid #111',
      }}>
        <div style={{ fontSize: '9px', color: '#333', letterSpacing: '0.1em', marginBottom: '12px' }}>
          MARKET STATUS
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          {[
            { label: 'EDGAR', status: 'MONITORING', color: '#00C805' },
            { label: 'AGENTS', status: '7 READY', color: '#0066FF' },
            { label: 'PIPELINE', status: 'ACTIVE', color: '#00C805' },
          ].map(({ label, status, color }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color, fontFamily: "'JetBrains Mono', monospace" }}>
                {status}
              </div>
              <div style={{ fontSize: '8px', color: '#333', letterSpacing: '0.08em', marginTop: '4px' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
