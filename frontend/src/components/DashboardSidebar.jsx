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
        background: "#050505",
      }}
      data-testid="dashboard-sidebar"
    >
      {/* Logo */}
      <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid #0d0d0d" }}>
        <div style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontWeight: 700, fontSize: "16px", color: "#fff",
          letterSpacing: "0.06em"
        }}>
          AFI
        </div>
        <div style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: "9px", color: "#333",
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
            background: location.pathname === "/dashboard" ? "#0a0a0a" : "transparent",
            borderLeft: location.pathname === "/dashboard" ? "2px solid #0066FF" : "2px solid transparent",
            color: location.pathname === "/dashboard" ? "#fff" : "#555",
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
      <div style={{ borderTop: "1px solid #0d0d0d", padding: "12px" }}>
        {/* Account */}
        <div style={{ marginBottom: "12px" }}>
          <div style={{
            fontSize: "10px", color: "#333",
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: "0.08em", marginBottom: "4px"
          }}>
            ACCOUNT
          </div>
          <div style={{
            fontSize: "11px", color: "#555",
            fontFamily: "'IBM Plex Mono', monospace",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            marginBottom: "6px",
          }}>
            {user?.email || "—"}
          </div>
          <div style={{
            display: "inline-block",
            fontSize: "9px", padding: "2px 6px",
            background: "#0d0d0d", border: "1px solid #1a1a1a",
            color: "#444",
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
            border: `1px solid ${telegramStatus === 'sent' ? '#00C80540' : telegramStatus === 'failed' ? '#FF333340' : '#1a1a1a'}`,
            color: telegramStatus === 'sent' ? '#00C805' : telegramStatus === 'failed' ? '#FF3333' : '#333',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "10px", letterSpacing: "0.06em",
            cursor: "pointer", textAlign: "left",
            marginBottom: "6px",
            transition: "border-color 150ms, color 150ms",
          }}
          onMouseEnter={e => { if (!telegramStatus) { e.currentTarget.style.borderColor = "#333"; e.currentTarget.style.color = "#888"; } }}
          onMouseLeave={e => { if (!telegramStatus) { e.currentTarget.style.borderColor = "#1a1a1a"; e.currentTarget.style.color = "#333"; } }}
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
            border: "1px solid #1a1a1a",
            color: "#333",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "10px", letterSpacing: "0.06em",
            cursor: "pointer", textAlign: "left",
            transition: "border-color 150ms, color 150ms",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#FF333340"; e.currentTarget.style.color = "#FF3333"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#1a1a1a"; e.currentTarget.style.color = "#333"; }}
          data-testid="sidebar-logout"
        >
          → SIGN OUT
        </button>
      </div>
    </div>
  );
}
