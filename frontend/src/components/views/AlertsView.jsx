// AlertsView.jsx — Notification control center: per-channel toggles, confidence threshold, test buttons
import { useState } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function AlertsView() {
  const [telegramEnabled, setTelegramEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(typeof Notification !== 'undefined' && Notification.permission === 'granted');
  const [threshold, setThreshold] = useState(60);
  const [telegramStatus, setTelegramStatus] = useState(null);
  const [emailStatus, setEmailStatus] = useState(null);
  const [chatId, setChatId] = useState(null);
  const [testing, setTesting] = useState('');

  const testTelegram = async () => {
    setTesting('telegram');
    setTelegramStatus(null);
    try {
      const res = await axios.post(`${API}/telegram/test`);
      setTelegramStatus(res.data);
    } catch (e) {
      setTelegramStatus({ status: 'error', message: e.message });
    } finally {
      setTesting('');
    }
  };

  const testEmail = async () => {
    setTesting('email');
    setEmailStatus(null);
    try {
      const res = await axios.post(`${API}/email/test`);
      setEmailStatus(res.data);
    } catch (e) {
      setEmailStatus({ status: 'error', message: e.message });
    } finally {
      setTesting('');
    }
  };

  const setupTelegram = async () => {
    try {
      const res = await axios.get(`${API}/telegram/setup`);
      if (res.data.chat_id) {
        setChatId(res.data.chat_id);
      } else {
        setChatId(null);
        setTelegramStatus({ status: 'error', message: res.data.error || 'No chat ID found. Send /start to your bot first.' });
      }
    } catch (e) {
      setTelegramStatus({ status: 'error', message: e.message });
    }
  };

  const ToggleRow = ({ label, enabled, onToggle, testFn, testLabel, status, statusLabel }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '16px', background: '#080808', border: '1px solid #141414',
      marginBottom: '8px',
    }}>
      <div style={{
        width: '8px', height: '8px', borderRadius: '50%',
        background: enabled ? '#00C805' : '#333',
      }} />
      <span style={{ fontSize: '12px', fontWeight: 600, color: '#aaa', flex: 1, letterSpacing: '0.04em' }}>
        {label}
      </span>
      <button
        onClick={onToggle}
        style={{
          padding: '4px 12px', background: enabled ? '#0066FF15' : '#111',
          border: `1px solid ${enabled ? '#0066FF40' : '#1a1a1a'}`,
          color: enabled ? '#0066FF' : '#444',
          fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em',
          cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {enabled ? 'ON' : 'OFF'}
      </button>
      {testFn && (
        <button
          data-testid={`test-${testLabel}`}
          onClick={testFn}
          disabled={testing === testLabel}
          style={{
            padding: '4px 12px', background: '#111',
            border: '1px solid #1a1a1a', color: '#555',
            fontSize: '9px', letterSpacing: '0.06em', cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {testing === testLabel ? 'TESTING...' : 'TEST'}
        </button>
      )}
      {status && (
        <span style={{
          fontSize: '9px', fontFamily: "'JetBrains Mono', monospace",
          color: status.status === 'sent' ? '#00C805' : '#FF3333',
        }}>
          {status.status === 'sent' ? 'SENT' : status.message?.slice(0, 30)}
        </span>
      )}
    </div>
  );

  return (
    <div data-testid="alerts-view" style={{ padding: '24px 20px', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{
        fontSize: '10px', color: '#333', letterSpacing: '0.12em', fontWeight: 600,
        fontFamily: "'JetBrains Mono', monospace", marginBottom: '24px',
      }}>
        ALERT SETTINGS
      </div>

      {/* Channel toggles */}
      <ToggleRow
        label="Telegram"
        enabled={telegramEnabled}
        onToggle={() => setTelegramEnabled(!telegramEnabled)}
        testFn={testTelegram}
        testLabel="telegram"
        status={telegramStatus}
      />
      <ToggleRow
        label="Email (Resend)"
        enabled={emailEnabled}
        onToggle={() => setEmailEnabled(!emailEnabled)}
        testFn={testEmail}
        testLabel="email"
        status={emailStatus}
      />
      <ToggleRow
        label="Browser Push"
        enabled={pushEnabled}
        onToggle={() => {
          if (!pushEnabled && typeof Notification !== 'undefined') {
            Notification.requestPermission().then(p => setPushEnabled(p === 'granted'));
          }
          setPushEnabled(!pushEnabled);
        }}
      />

      {/* Telegram Setup */}
      <div style={{
        margin: '24px 0', padding: '16px', background: '#060606', border: '1px solid #111',
      }}>
        <div style={{ fontSize: '9px', color: '#333', letterSpacing: '0.1em', marginBottom: '12px' }}>
          TELEGRAM SETUP
        </div>
        <button
          data-testid="telegram-setup-btn"
          onClick={setupTelegram}
          style={{
            padding: '8px 16px', background: '#111', border: '1px solid #1a1a1a',
            color: '#666', fontSize: '10px', cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em',
          }}
        >
          GET CHAT ID
        </button>
        {chatId && (
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#0066FF', fontFamily: "'JetBrains Mono', monospace" }}>
            Chat ID: {chatId}
          </div>
        )}
      </div>

      {/* Confidence threshold */}
      <div style={{
        padding: '16px', background: '#080808', border: '1px solid #141414',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '10px', color: '#444', letterSpacing: '0.1em', fontWeight: 600 }}>
            CONFIDENCE THRESHOLD
          </span>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff', fontFamily: "'JetBrains Mono', monospace" }}>
            {threshold}%
          </span>
        </div>
        <input
          data-testid="confidence-slider"
          type="range"
          min="0"
          max="100"
          value={threshold}
          onChange={e => setThreshold(parseInt(e.target.value))}
          style={{
            width: '100%', height: '3px',
            appearance: 'none', background: '#1a1a1a',
            outline: 'none', cursor: 'pointer',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
          <span style={{ fontSize: '8px', color: '#222' }}>0%</span>
          <span style={{ fontSize: '8px', color: '#222' }}>100%</span>
        </div>
        <p style={{ fontSize: '10px', color: '#333', marginTop: '8px' }}>
          Only receive alerts when signal confidence exceeds {threshold}%
        </p>
      </div>
    </div>
  );
}
