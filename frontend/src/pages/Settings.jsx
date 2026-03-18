// Settings.jsx — Account, notifications, and alert configuration
import { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { usePushNotifications } from '../hooks/usePushNotifications';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Settings() {
    const { user } = useAuth();
    const { requestPermission } = usePushNotifications();

    const [telegramStatus, setTelegramStatus] = useState(null);
    const [telegramLoading, setTelegramLoading] = useState(false);
    const [pushStatus, setPushStatus] = useState(
        typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
    );

    const testTelegram = async () => {
        setTelegramLoading(true);
        setTelegramStatus(null);
        try {
            const res = await axios.post(`${API}/telegram/test`);
            setTelegramStatus(res.data?.status === 'sent' ? 'sent' : 'ok');
        } catch {
            setTelegramStatus('failed');
        } finally {
            setTelegramLoading(false);
            setTimeout(() => setTelegramStatus(null), 5000);
        }
    };

    const enablePush = async () => {
        const granted = await requestPermission();
        setPushStatus(granted ? 'granted' : 'denied');
    };

    const SectionTitle = ({ children }) => (
        <div style={{
            fontSize: '9px',
            color: '#2a2a2a',
            letterSpacing: '0.14em',
            marginBottom: '16px',
            paddingBottom: '8px',
            borderBottom: '1px solid #0d0d0d',
        }}>
            {children}
        </div>
    );

    const SettingRow = ({ label, description, action }) => (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 0',
            borderBottom: '1px solid #0a0a0a',
        }}>
            <div>
                <div style={{ fontSize: '12px', color: '#ccc', marginBottom: '2px' }}>{label}</div>
                <div style={{ fontSize: '10px', color: '#333' }}>{description}</div>
            </div>
            {action && <div>{action}</div>}
        </div>
    );

    const ActionButton = ({ onClick, disabled, children, variant = 'default' }) => {
        const colors = {
            default: { border: '#1a1a1a', color: '#333', hoverBorder: '#333', hoverColor: '#888' },
            success: { border: '#00C80540', color: '#00C805', hoverBorder: '#00C80540', hoverColor: '#00C805' },
            error: { border: '#FF333340', color: '#FF3333', hoverBorder: '#FF333340', hoverColor: '#FF3333' },
            active: { border: '#0066FF40', color: '#0066FF', hoverBorder: '#0066FF40', hoverColor: '#0066FF' },
        };
        const c = colors[variant] || colors.default;

        return (
            <button
                onClick={onClick}
                disabled={disabled}
                style={{
                    padding: '5px 12px',
                    background: 'transparent',
                    border: `1px solid ${c.border}`,
                    color: c.color,
                    fontSize: '9px',
                    letterSpacing: '0.08em',
                    cursor: disabled ? 'default' : 'pointer',
                    fontFamily: "'JetBrains Mono', monospace",
                    transition: 'all 150ms',
                    opacity: disabled ? 0.5 : 1,
                }}
                onMouseEnter={e => { if (!disabled) { e.currentTarget.style.borderColor = c.hoverBorder; e.currentTarget.style.color = c.hoverColor; } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.color; }}
            >
                {children}
            </button>
        );
    };

    return (
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', maxWidth: '560px' }}>

                <h1 style={{ fontSize: '13px', color: '#fff', letterSpacing: '0.1em', marginBottom: '32px', fontWeight: 700 }}>
                    SETTINGS
                </h1>

                {/* NOTIFICATIONS */}
                <div style={{ marginBottom: '32px' }}>
                    <SectionTitle>NOTIFICATIONS</SectionTitle>
                    <SettingRow
                        label="Telegram Alerts"
                        description="Get alerts when signals match your thresholds"
                        action={
                            <ActionButton
                                onClick={testTelegram}
                                disabled={telegramLoading}
                                variant={telegramStatus === 'sent' || telegramStatus === 'ok' ? 'success' : telegramStatus === 'failed' ? 'error' : 'default'}
                            >
                                {telegramLoading ? '···' : telegramStatus === 'sent' || telegramStatus === 'ok' ? '✓ SENT' : telegramStatus === 'failed' ? '✗ FAILED' : 'TEST'}
                            </ActionButton>
                        }
                    />
                    <SettingRow
                        label="Browser Notifications"
                        description="Push alerts even when the tab is closed"
                        action={
                            pushStatus === 'granted' ? (
                                <span style={{ fontSize: '10px', color: '#00C805', letterSpacing: '0.06em' }}>ENABLED</span>
                            ) : pushStatus === 'denied' ? (
                                <span style={{ fontSize: '10px', color: '#FF3333', letterSpacing: '0.06em' }}>BLOCKED</span>
                            ) : pushStatus === 'unsupported' ? (
                                <span style={{ fontSize: '10px', color: '#1e1e1e', letterSpacing: '0.06em' }}>N/A</span>
                            ) : (
                                <ActionButton onClick={enablePush}>ENABLE</ActionButton>
                            )
                        }
                    />
                </div>

                {/* ALERT THRESHOLDS */}
                <div style={{ marginBottom: '32px' }}>
                    <SectionTitle>ALERT THRESHOLDS</SectionTitle>
                    <SettingRow
                        label="Watchlist alerts"
                        description="Always alert for watched tickers (bypasses threshold)"
                        action={
                            <span style={{ fontSize: '10px', color: '#00C805', letterSpacing: '0.06em' }}>ALWAYS ON</span>
                        }
                    />
                    <SettingRow
                        label="Smart thresholds"
                        description="Confidence ≥ 60% for Positive/Risk, Impact ≥ 55"
                        action={
                            <span style={{ fontSize: '10px', color: '#0066FF', letterSpacing: '0.06em' }}>ACTIVE</span>
                        }
                    />
                </div>

                {/* ACCOUNT */}
                <div style={{ marginBottom: '32px' }}>
                    <SectionTitle>ACCOUNT</SectionTitle>
                    <SettingRow label="Email" description={user?.email || '—'} />
                    <SettingRow label="Plan" description="Retail (Free)" />
                </div>

            </div>
    );
}
