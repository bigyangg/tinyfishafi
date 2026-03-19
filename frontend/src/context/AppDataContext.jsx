import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

// ── Request deduplication cache (module-level, survives nav) ───────────────
const REQUEST_CACHE = new Map();

async function cachedFetch(url, ttlMs = 60000) {
  const now = Date.now();
  const cached = REQUEST_CACHE.get(url);
  if (cached && (now - cached.ts) < ttlMs) {
    return cached.data;
  }
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  REQUEST_CACHE.set(url, { data, ts: now });
  return data;
}

const AppDataContext = createContext(null);

export function AppDataProvider({ children }) {
  const [signals, setSignals] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('afi_signals_cache') || '[]');
    } catch {
      return [];
    }
  });
  const [agentStatus, setAgentStatus] = useState(() => {
    try {
      return localStorage.getItem('afi_agent_status_cache') || null;
    } catch {
      return null;
    }
  });
  const [marketPulse, setMarketPulse] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [backendOnline, setBackendOnline] = useState(true);
  const [filedToday, setFiledToday] = useState(0);
  const [nextPoll, setNextPoll] = useState(null);
  const subscriptionRef = useRef(null);
  const signalsRef = useRef(signals);
  const healthFailureCountRef = useRef(0);

  // Keep ref in sync for use inside subscription closure
  useEffect(() => {
    signalsRef.current = signals;
  }, [signals]);

  // Single Supabase Realtime subscription — never torn down by navigation
  useEffect(() => {
    subscriptionRef.current = supabase
      .channel('signals-global')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'signals' },
        (payload) => {
          setSignals(prev => {
            const updated = [payload.new, ...prev].slice(0, 200);
            localStorage.setItem('afi_signals_cache', JSON.stringify(updated));
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      subscriptionRef.current?.unsubscribe();
    };
  }, []); // empty deps — runs once, never torn down

  // Backend health check (every 30s) with failure counter to avoid flashing offline
  useEffect(() => {
    const checkHealth = () => {
      // Health check skips cache (always fresh)
      fetch(`${BACKEND_URL}/api/health`, { signal: AbortSignal.timeout(5000) })
        .then(r => {
          if (r.ok) {
            healthFailureCountRef.current = 0;
            setBackendOnline(true);
          }
        })
        .catch(() => {
          healthFailureCountRef.current += 1;
          if (healthFailureCountRef.current >= 2) {
            setBackendOnline(false);
          }
        });
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Agent status polling (every 20s) with 10s request cache
  useEffect(() => {
    const fetchAgentStatus = () => {
      cachedFetch(`${BACKEND_URL}/api/edgar/status`, 10000)
        .then(data => {
          if (data) {
            const status = data.agent_status || 'stopped';
            setAgentStatus(status);
            localStorage.setItem('afi_agent_status_cache', status);
            setFiledToday(data.filings_processed_today || 0);
            if (data.next_poll_seconds != null) {
              setNextPoll(data.next_poll_seconds);
            }
          }
        })
        .catch(() => {});
    };
    fetchAgentStatus();
    const interval = setInterval(fetchAgentStatus, 20000);
    return () => clearInterval(interval);
  }, []);

  // Staggered initial fetch
  useEffect(() => {
    // Market pulse — 30s cache
    setTimeout(() => {
      cachedFetch(`${BACKEND_URL}/api/market/pulse`, 30000)
        .then(data => { if (data) setMarketPulse(data); })
        .catch(() => {});
    }, 300);

    // Only fetch signals if cache is empty or stale (>5 min)
    const cacheTimestamp = parseInt(localStorage.getItem('afi_signals_timestamp') || '0');
    const cacheAge = Date.now() - cacheTimestamp;
    const cachedSignals = (() => {
      try { return JSON.parse(localStorage.getItem('afi_signals_cache') || '[]'); }
      catch { return []; }
    })();

    if (cachedSignals.length === 0 || cacheAge > 300000) {
      // Signals — 3 min cache
      cachedFetch(`${BACKEND_URL}/api/signals`, 180000)
        .then(data => {
          const sigs = Array.isArray(data) ? data : (data?.signals || []);
          if (sigs.length > 0) {
            setSignals(sigs);
            localStorage.setItem('afi_signals_cache', JSON.stringify(sigs));
            localStorage.setItem('afi_signals_timestamp', Date.now().toString());
          }
        })
        .catch(() => {});
    }
  }, []); // empty deps — runs once on mount

  const refreshSignals = () => {
    fetch(`${BACKEND_URL}/api/signals`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const signals = Array.isArray(data) ? data : (data && Array.isArray(data.signals) ? data.signals : []);
        if (signals.length > 0) {
          setSignals(signals);
          localStorage.setItem('afi_signals_cache', JSON.stringify(signals));
          localStorage.setItem('afi_signals_timestamp', Date.now().toString());
        }
      })
      .catch(() => {});
  };

  return (
    <AppDataContext.Provider value={{ signals, agentStatus, marketPulse, watchlist, setWatchlist, refreshSignals, backendOnline, filedToday, nextPoll }}>
      {children}
    </AppDataContext.Provider>
  );
}

export const useAppData = () => {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
};
