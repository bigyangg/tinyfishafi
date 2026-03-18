import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, LogOut, Send } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function DashboardSidebar({ user, onLogout }) {
  const location = useLocation();
  const [telegramStatus, setTelegramStatus] = useState(null);
  const [telegramLoading, setTelegramLoading] = useState(false);

  const testTelegram = async () => {
    setTelegramLoading(true);
    setTelegramStatus(null);
    try {
      const res = await axios.post(`${API}/telegram/test`);
      setTelegramStatus(res.data?.status === 'sent' ? 'sent' : 'failed');
    } catch {
      setTelegramStatus('failed');
    } finally {
      setTelegramLoading(false);
      setTimeout(() => setTelegramStatus(null), 5000);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg-base)",
      }}
      data-testid="dashboard-sidebar"
    >
      {/* Logo */}
      <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontWeight: 700, fontSize: "16px", color: "var(--text-primary)",
          letterSpacing: "0.06em"
        }}>
          AFI
        </div>
        <div style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: "9px", color: "var(--text-tertiary)",
          letterSpacing: "0.12em", marginTop: "2px"
        }}>
          FILING INTELLIGENCE
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: "12px 8px", flex: 1 }}>
        <Link
          to="/dashboard"
          style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "8px 10px", textDecoration: "none",
            background: location.pathname === "/dashboard" ? "var(--bg-active)" : "transparent",
            borderLeft: location.pathname === "/dashboard" ? "2px solid var(--accent-blue)" : "2px solid transparent",
            color: location.pathname === "/dashboard" ? "var(--text-primary)" : "var(--text-tertiary)",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "12px", letterSpacing: "0.04em",
            transition: "all 100ms",
          }}
          data-testid="sidebar-nav-dashboard"
        >
          <LayoutDashboard size={14} />
          Dashboard
        </Link>
      </nav>

      {/* Bottom — account + actions */}
      <div style={{ borderTop: "1px solid var(--border-default)", padding: "12px" }}>
        {/* Account */}
        <div style={{ marginBottom: "12px" }}>
          <div style={{
            fontSize: "10px", color: "var(--text-tertiary)",
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: "0.08em", marginBottom: "4px"
          }}>
            ACCOUNT
          </div>
          <div style={{
            fontSize: "11px", color: "var(--text-secondary)",
            fontFamily: "'IBM Plex Mono', monospace",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            marginBottom: "6px",
          }}>
            {user?.email || "—"}
          </div>
          <div style={{
            display: "inline-block",
            fontSize: "9px", padding: "2px 6px",
            background: "var(--bg-card)", border: "1px solid var(--border-default)",
            color: "var(--text-muted)",
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: "0.08em",
          }}>
            {(user?.tier || "RETAIL").toUpperCase()}
          </div>
        </div>

        {/* Test Telegram */}
        <button
          onClick={testTelegram}
          disabled={telegramLoading}
          style={{
            width: "100%", padding: "7px 10px",
            background: "transparent",
            border: `1px solid ${telegramStatus === 'sent' ? 'var(--signal-positive)' : telegramStatus === 'failed' ? 'var(--signal-risk)' : 'var(--border-default)'}`,
            color: telegramStatus === 'sent' ? 'var(--signal-positive)' : telegramStatus === 'failed' ? 'var(--signal-risk)' : 'var(--text-tertiary)',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "10px", letterSpacing: "0.06em",
            cursor: "pointer", textAlign: "left",
            marginBottom: "6px",
            transition: "border-color 150ms, color 150ms",
          }}
          onMouseEnter={e => { if (!telegramStatus) { e.currentTarget.style.borderColor = "var(--text-secondary)"; e.currentTarget.style.color = "var(--text-secondary)"; } }}
          onMouseLeave={e => { if (!telegramStatus) { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-tertiary)"; } }}
          data-testid="telegram-test-button"
        >
          {telegramLoading ? '··· SENDING' : telegramStatus === 'sent' ? '✓ SENT' : telegramStatus === 'failed' ? '✗ FAILED' : '✈ TEST TELEGRAM'}
        </button>

        {/* Sign Out */}
        <button
          onClick={onLogout}
          style={{
            width: "100%", padding: "7px 10px",
            background: "transparent",
            border: "1px solid var(--border-default)",
            color: "var(--text-tertiary)",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "10px", letterSpacing: "0.06em",
            cursor: "pointer", textAlign: "left",
            transition: "border-color 150ms, color 150ms",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--signal-risk)"; e.currentTarget.style.color = "var(--signal-risk)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
          data-testid="sidebar-logout"
        >
          → SIGN OUT
        </button>
      </div>
    </div>
  );
}
