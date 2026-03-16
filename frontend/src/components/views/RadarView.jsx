// RadarView.jsx — Forward-looking intelligence calendar: upcoming filings + earnings
import { useState, useEffect } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

function getWeekDates() {
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return DAYS.map((_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

export default function RadarView() {
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const weekDates = getWeekDates();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API}/radar`);
        setUpcoming(res.data.upcoming || []);
      } catch {
        setUpcoming([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div data-testid="radar-view" style={{ padding: '24px 20px' }}>
      <div style={{
        fontSize: '10px', color: '#333', letterSpacing: '0.12em', fontWeight: 600,
        fontFamily: "'JetBrains Mono', monospace", marginBottom: '20px',
      }}>
        RADAR — THIS WEEK
      </div>

      {/* Weekly calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '32px' }}>
        {DAYS.map((day, i) => {
          const date = weekDates[i];
          const isToday = new Date().toDateString() === date.toDateString();
          const dayEvents = upcoming.filter(u => {
            if (!u.last_filed_at) return false;
            const filed = new Date(u.last_filed_at);
            return filed.toDateString() === date.toDateString();
          });

          return (
            <div key={day} style={{
              background: isToday ? '#0066FF08' : '#080808',
              border: `1px solid ${isToday ? '#0066FF30' : '#141414'}`,
              padding: '12px 10px',
              minHeight: '120px',
            }}>
              <div style={{
                fontSize: '9px', letterSpacing: '0.1em', fontWeight: 700,
                color: isToday ? '#0066FF' : '#444', marginBottom: '4px',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {day}
              </div>
              <div style={{ fontSize: '10px', color: '#222', marginBottom: '10px' }}>
                {date.getDate()}
              </div>

              {dayEvents.map((ev, j) => (
                <div key={j} style={{
                  padding: '4px 6px', marginBottom: '4px',
                  background: '#111', border: '1px solid #1a1a1a',
                  fontSize: '9px', fontFamily: "'JetBrains Mono', monospace",
                }}>
                  <span style={{ color: '#888', fontWeight: 600 }}>{ev.ticker}</span>
                  <span style={{ color: '#333', marginLeft: '4px' }}>{ev.last_filing_type}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Upcoming filings list */}
      <div style={{ fontSize: '10px', color: '#333', letterSpacing: '0.1em', marginBottom: '12px', fontWeight: 600 }}>
        RECENT ACTIVITY
      </div>
      {loading ? (
        <div style={{ color: '#222', fontSize: '11px' }}>Loading radar data...</div>
      ) : upcoming.length === 0 ? (
        <div style={{ color: '#222', fontSize: '11px' }}>No recent filing activity detected.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {upcoming.slice(0, 15).map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '8px 12px', background: '#080808', border: '1px solid #111',
            }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#aaa', fontFamily: "'JetBrains Mono', monospace", minWidth: '50px' }}>
                {item.ticker}
              </span>
              <span style={{ fontSize: '9px', color: '#444', fontFamily: "'JetBrains Mono', monospace" }}>
                {item.last_filing_type}
              </span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: '9px', color: '#222' }}>
                {item.last_filed_at ? new Date(item.last_filed_at).toLocaleDateString() : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
