// pages/Dashboard.jsx — Main dashboard with realtime updates
// Purpose: Alert feed with Supabase realtime, agent status bar, health check,
//          AI brief panel, signal detail modal, animations
// Dependencies: @supabase/supabase-js, axios, lucide-react

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import DashboardSidebar from '../components/DashboardSidebar';
import AlertCard from '../components/AlertCard';
import WatchlistPanel from '../components/WatchlistPanel';
import SignalDetailModal from '../components/SignalDetailModal';
import { RefreshCw, Circle, Activity, Zap, Wifi, WifiOff, Clock, AlertTriangle } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function relativeTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'yesterday';
  if (diffD < 7) return `${diffD}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatCountdown(seconds) {
  if (seconds === null || seconds === undefined) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function Dashboard() {
  const { user, authHeaders, logout } = useAuth();
  const [allSignals, setAllSignals] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [newSignalIds, setNewSignalIds] = useState(new Set());
  const [, setTimeTick] = useState(0); // force re-render for relative timestamps

  // Health check state
  const [backendOnline, setBackendOnline] = useState(null);

  // Agent status
  const [agentStatus, setAgentStatus] = useState({
    agent_status: 'not_initialized',
    last_poll_time: null,
    filings_processed_today: 0,
    next_poll_seconds: null,
    poll_interval: 120,
  });
  const [countdown, setCountdown] = useState(null);

  // AI Brief
  const [brief, setBrief] = useState('');
  const [briefLoading, setBriefLoading] = useState(false);

  // Format a Supabase signal row to match API format
  const formatSignalRow = useCallback((row) => ({
    id: row.id || '',
    ticker: row.ticker || '',
    filing_type: row.filing_type || '8-K',
    classification: row.signal || 'Pending',
    company_name: row.company || '',
    summary: row.summary || '',
    confidence: row.confidence || 0,
    filed_at: row.filed_at || '',
    accession_number: row.accession_number || '',
    edgar_url: row.edgar_url || '',
  }), []);

  // Health check
  const checkHealth = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/health`, { timeout: 5000 });
      setBackendOnline(res.data?.status === 'ok');
    } catch {
      setBackendOnline(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [sigRes, wlRes] = await Promise.all([
        axios.get(`${API}/signals`, { headers: authHeaders() }),
        axios.get(`${API}/watchlist`, { headers: authHeaders() }),
      ]);
      setAllSignals(sigRes.data.signals || []);
      setWatchlist(wlRes.data.tickers || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAgentStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/edgar/status`);
      setAgentStatus(res.data);
      if (res.data.next_poll_seconds !== null && res.data.next_poll_seconds !== undefined) {
        setCountdown(res.data.next_poll_seconds);
      }
    } catch {
      // Silently fail
    }
  }, []);

  const fetchBrief = useCallback(async () => {
    setBriefLoading(true);
    try {
      const res = await axios.get(`${API}/brief`);
      setBrief(res.data.brief || '');
    } catch {
      setBrief('Unable to load market brief.');
    } finally {
      setBriefLoading(false);
    }
  }, []);

  // Initial data load
  useEffect(() => {
    fetchData();
    fetchAgentStatus();
    checkHealth();
    fetchBrief();
  }, [fetchData, fetchAgentStatus, checkHealth, fetchBrief]);

  // 60-second polling for signals + 30s for health
  useEffect(() => {
    const dataInterval = setInterval(() => {
      fetchData();
      fetchAgentStatus();
    }, 60000);
    const healthInterval = setInterval(checkHealth, 30000);
    return () => {
      clearInterval(dataInterval);
      clearInterval(healthInterval);
    };
  }, [fetchData, fetchAgentStatus, checkHealth]);

  // Countdown timer - decrements every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 0) return prev;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Force re-render every 60s for relative timestamps
  useEffect(() => {
    const timer = setInterval(() => setTimeTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  // Supabase realtime subscription for signals
  useEffect(() => {
    const channel = supabase
      .channel('signals-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'signals' },
        (payload) => {
          const newSignal = formatSignalRow(payload.new);
          setAllSignals(prev => [newSignal, ...prev]);
          setLastUpdated(new Date());
          // Mark as new for animation
          setNewSignalIds(prev => new Set([...prev, newSignal.id]));
          setTimeout(() => {
            setNewSignalIds(prev => {
              const next = new Set(prev);
              next.delete(newSignal.id);
              return next;
            });
          }, 3000);
          // Refresh brief when new signal arrives
          fetchBrief();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'signals' },
        (payload) => {
          const updated = formatSignalRow(payload.new);
          setAllSignals(prev =>
            prev.map(s => s.id === updated.id ? updated : s)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [formatSignalRow, fetchBrief]);

  // Supabase realtime subscription for watchlist
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('watchlist-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'watchlist' },
        () => {
          axios.get(`${API}/watchlist`, { headers: authHeaders() })
            .then(res => setWatchlist(res.data.tickers || []))
            .catch(() => { });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const addTicker = async (ticker) => {
    try {
      const res = await axios.post(`${API}/watchlist`, { ticker }, { headers: authHeaders() });
      setWatchlist(res.data.tickers);
      return null;
    } catch (err) {
      return err?.response?.data?.detail || 'Failed to add ticker';
    }
  };

  const removeTicker = async (ticker) => {
    try {
      const res = await axios.delete(`${API}/watchlist/${ticker}`, { headers: authHeaders() });
      setWatchlist(res.data.tickers);
    } catch (err) {
      console.error('Failed to remove ticker:', err);
    }
  };

  // Filter signals: watchlist filter first, then classification filter
  let displayedSignals = allSignals;
  if (watchlist.length > 0) {
    displayedSignals = displayedSignals.filter(s => watchlist.includes(s.ticker));
  }
  if (filter !== 'All') {
    displayedSignals = displayedSignals.filter(s => s.classification === filter);
  }

  const FILTER_TABS = ['All', 'Positive', 'Neutral', 'Risk'];
  const FILTER_COLORS = {
    All: '',
    Positive: 'text-[#00C805]',
    Neutral: 'text-zinc-400',
    Risk: 'text-[#FF3333]',
  };

  const isAgentRunning = agentStatus.agent_status === 'running';

  return (
    <div className="flex h-screen bg-[#050505] overflow-hidden" data-testid="dashboard">
      <DashboardSidebar user={user} onLogout={logout} />

      <div className="flex-1 flex overflow-hidden">
        {/* Main feed */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Offline banner */}
          {backendOnline === false && (
            <div className="bg-[#FF3333]/10 border-b border-[#FF3333]/20 px-6 py-2 flex items-center gap-2" data-testid="offline-banner">
              <AlertTriangle size={12} className="text-[#FF3333]" />
              <span className="text-[11px] font-mono text-[#FF3333]">
                Cannot reach AFI backend. Check that the server is running on port 8001.
              </span>
            </div>
          )}

          {/* Agent Status Bar */}
          <div className="border-b border-zinc-800 px-6 py-2 flex items-center gap-4 bg-[#0A0A0A]" data-testid="agent-status-bar">
            <Activity size={12} className="text-zinc-500" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">EDGAR Agent</span>

            {/* Status badge */}
            <span className={`flex items-center gap-1.5 text-[10px] font-mono font-bold px-2 py-0.5 uppercase tracking-wider ${isAgentRunning
              ? 'bg-[#00C805]/10 text-[#00C805] border border-[#00C805]/20'
              : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
              }`}>
              <span
                className={`w-1.5 h-1.5 rounded-full ${isAgentRunning ? 'bg-[#00C805]' : 'bg-zinc-600'}`}
                style={isAgentRunning ? { animation: 'pulse 2s ease-in-out infinite' } : {}}
              ></span>
              {isAgentRunning ? 'UP' : 'DOWN'}
            </span>

            {/* Last poll */}
            <span className="text-[10px] font-mono text-zinc-600">
              Last poll: <span className="text-zinc-400">{agentStatus.last_poll_time ? relativeTime(agentStatus.last_poll_time) : 'Never'}</span>
            </span>

            {/* Next poll countdown */}
            {isAgentRunning && countdown !== null && (
              <span className="text-[10px] font-mono text-zinc-600 flex items-center gap-1">
                <Clock size={9} className="text-zinc-600" />
                Next: <span className="text-zinc-400">{formatCountdown(countdown)}</span>
              </span>
            )}

            {/* Filings today */}
            <span className="text-[10px] font-mono text-zinc-600">
              Today: <span className="text-zinc-400 font-bold">{agentStatus.filings_processed_today}</span> filings
            </span>

            {/* Online/Offline indicator */}
            <div className="ml-auto flex items-center gap-1.5">
              {backendOnline === true ? (
                <>
                  <Wifi size={10} className="text-[#00C805]" />
                  <span className="text-[9px] font-mono text-[#00C805] uppercase tracking-widest">Online</span>
                </>
              ) : backendOnline === false ? (
                <>
                  <WifiOff size={10} className="text-[#FF3333]" />
                  <span className="text-[9px] font-mono text-[#FF3333] uppercase tracking-widest">Offline</span>
                </>
              ) : (
                <>
                  <Zap size={10} className="text-zinc-700" />
                  <span className="text-[9px] font-mono text-zinc-700 uppercase tracking-widest">Checking</span>
                </>
              )}
            </div>
          </div>

          {/* Feed header */}
          <div className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-sans font-semibold text-white text-base" data-testid="feed-title">Alert Feed</h1>
                  <span className="font-mono text-xs text-zinc-500 border border-zinc-800 px-2 py-0.5" data-testid="feed-count">
                    {displayedSignals.length}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Circle size={6} className="fill-[#00C805] text-[#00C805]" />
                  <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Live · EDGAR monitored</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Filter tabs */}
              <div className="flex items-center gap-0.5 border border-zinc-800" data-testid="filter-tabs">
                {FILTER_TABS.map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider transition-colors duration-75 ${filter === f
                      ? 'bg-zinc-800 text-white'
                      : `text-zinc-600 hover:text-zinc-300 ${FILTER_COLORS[f]}`
                      }`}
                    data-testid={`filter-tab-${f.toLowerCase()}`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              {/* Last updated */}
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-700">
                <RefreshCw size={10} />
                <span>{lastUpdated ? relativeTime(lastUpdated.toISOString()) : ''}</span>
              </div>
            </div>
          </div>

          {/* Watchlist filter indicator */}
          {watchlist.length > 0 && (
            <div className="border-b border-zinc-800 px-6 py-2 bg-[#0066FF]/5 flex items-center gap-2" data-testid="watchlist-filter-indicator">
              <span className="text-[10px] font-mono text-[#0066FF] uppercase tracking-widest">Filtered to watchlist</span>
              <span className="font-mono text-[10px] text-zinc-500">
                ({watchlist.join(', ')})
              </span>
            </div>
          )}

          {/* Signals list */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2" data-testid="signals-list">
            {loading ? (
              <div className="flex items-center justify-center h-32" data-testid="loading-state">
                <span className="font-mono text-xs text-zinc-600 uppercase tracking-widest">Loading signals...</span>
              </div>
            ) : displayedSignals.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center" data-testid="empty-state">
                {isAgentRunning ? (
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className="w-2 h-2 rounded-full bg-[#00C805]"
                        style={{ animation: 'pulse 2s ease-in-out infinite' }}
                      ></span>
                      <span className="text-zinc-400 font-mono text-xs uppercase tracking-widest">Agent is live</span>
                    </div>
                    <div className="text-zinc-600 text-xs font-mono">
                      Waiting for next EDGAR filing. Polling every {Math.floor(agentStatus.poll_interval / 60)} minutes.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-zinc-700 font-mono text-xs uppercase tracking-widest mb-2">No alerts found</div>
                    {watchlist.length > 0 && (
                      <div className="text-zinc-600 text-xs font-mono">
                        No alerts yet for your watchlist.
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              displayedSignals.map(signal => (
                <AlertCard
                  key={signal.id}
                  signal={signal}
                  onClick={setSelectedSignal}
                  isNew={newSignalIds.has(signal.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Right panel: Watchlist + AI Brief */}
        <div className="w-[280px] shrink-0 border-l border-zinc-800 bg-[#050505] flex flex-col h-full">
          <WatchlistPanel
            watchlist={watchlist}
            onAdd={addTicker}
            onRemove={removeTicker}
          />

          {/* AI Brief Panel */}
          <div className="border-t border-zinc-800 px-4 py-3 flex flex-col" data-testid="ai-brief-panel">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={10} className="text-[#0066FF]" />
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold font-mono">Market Brief</span>
            </div>
            {briefLoading ? (
              <div className="text-zinc-700 text-[11px] font-mono">Generating brief...</div>
            ) : brief ? (
              <p className="text-zinc-400 text-[11px] leading-relaxed font-mono">{brief}</p>
            ) : (
              <p className="text-zinc-700 text-[11px] font-mono">No brief available.</p>
            )}
          </div>
        </div>
      </div>

      {/* Signal Detail Modal */}
      {selectedSignal && (
        <SignalDetailModal
          signal={selectedSignal}
          onClose={() => setSelectedSignal(null)}
        />
      )}

      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes flashHighlight {
          0% { background-color: rgba(0, 102, 255, 0.1); }
          100% { background-color: transparent; }
        }
        .signal-new {
          animation: slideIn 0.3s ease-out, flashHighlight 2s ease-out;
        }
      `}</style>
    </div>
  );
}
