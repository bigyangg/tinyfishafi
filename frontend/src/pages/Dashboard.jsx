// pages/Dashboard.jsx — Main dashboard with realtime updates
// Purpose: Alert feed with Supabase realtime, agent status bar, signal detail modal
// Dependencies: @supabase/supabase-js, axios, lucide-react

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import DashboardSidebar from '../components/DashboardSidebar';
import AlertCard from '../components/AlertCard';
import WatchlistPanel from '../components/WatchlistPanel';
import SignalDetailModal from '../components/SignalDetailModal';
import { RefreshCw, Circle, Activity, Zap } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Dashboard() {
  const { user, authHeaders, logout } = useAuth();
  const [allSignals, setAllSignals] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [agentStatus, setAgentStatus] = useState({
    agent_status: 'not_initialized',
    last_poll_time: null,
    filings_processed_today: 0,
  });

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
    } catch (err) {
      // Silently fail — agent might not be running
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchAgentStatus();
  }, [fetchData, fetchAgentStatus]);

  // 60-second polling for signals
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData();
      fetchAgentStatus();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchData, fetchAgentStatus]);

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
  }, [formatSignalRow]);

  // Supabase realtime subscription for watchlist
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('watchlist-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'watchlist' },
        () => {
          // Refetch watchlist on any change
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

  const formatLastUpdated = () => {
    if (!lastUpdated) return '';
    return lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const isAgentRunning = agentStatus.agent_status === 'running';

  const formatPollTime = () => {
    if (!agentStatus.last_poll_time) return 'Never';
    try {
      const d = new Date(agentStatus.last_poll_time);
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Unknown';
    }
  };

  return (
    <div className="flex h-screen bg-[#050505] overflow-hidden" data-testid="dashboard">
      <DashboardSidebar user={user} onLogout={logout} />

      <div className="flex-1 flex overflow-hidden">
        {/* Main feed */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Agent Status Bar */}
          <div className="border-b border-zinc-800 px-6 py-2 flex items-center gap-4 bg-[#0A0A0A]" data-testid="agent-status-bar">
            <Activity size={12} className="text-zinc-500" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">EDGAR Agent</span>

            {/* Status badge */}
            <span className={`flex items-center gap-1.5 text-[10px] font-mono font-bold px-2 py-0.5 uppercase tracking-wider ${isAgentRunning
                ? 'bg-[#00C805]/10 text-[#00C805] border border-[#00C805]/20'
                : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
              }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isAgentRunning ? 'bg-[#00C805]' : 'bg-zinc-600'}`}></span>
              {isAgentRunning ? 'UP' : 'DOWN'}
            </span>

            <span className="text-[10px] font-mono text-zinc-600">
              Last poll: <span className="text-zinc-400">{formatPollTime()}</span>
            </span>

            <span className="text-[10px] font-mono text-zinc-600">
              Today: <span className="text-zinc-400 font-bold">{agentStatus.filings_processed_today}</span> filings
            </span>

            <div className="ml-auto flex items-center gap-1.5">
              <Zap size={10} className={isAgentRunning ? 'text-[#00C805]' : 'text-zinc-700'} />
              <span className="text-[9px] font-mono text-zinc-700 uppercase tracking-widest">
                {isAgentRunning ? 'Live' : 'Offline'}
              </span>
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
                <span>{formatLastUpdated()}</span>
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
                <div className="text-zinc-700 font-mono text-xs uppercase tracking-widest mb-2">No alerts found</div>
                {watchlist.length > 0 && (
                  <div className="text-zinc-600 text-xs font-mono">
                    No alerts yet for your watchlist.
                  </div>
                )}
              </div>
            ) : (
              displayedSignals.map(signal => (
                <AlertCard
                  key={signal.id}
                  signal={signal}
                  onClick={setSelectedSignal}
                />
              ))
            )}
          </div>
        </div>

        {/* Watchlist panel */}
        <WatchlistPanel
          watchlist={watchlist}
          onAdd={addTicker}
          onRemove={removeTicker}
        />
      </div>

      {/* Signal Detail Modal */}
      {selectedSignal && (
        <SignalDetailModal
          signal={selectedSignal}
          onClose={() => setSelectedSignal(null)}
        />
      )}
    </div>
  );
}
