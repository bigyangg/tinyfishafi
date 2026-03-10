import { useState } from 'react';
import { X, Plus, AlertCircle } from 'lucide-react';

export default function WatchlistPanel({ watchlist, onAdd, onRemove, loading }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const handleAdd = async () => {
    const ticker = input.trim().toUpperCase();
    if (!ticker) return;
    if (!/^[A-Z]{1,5}$/.test(ticker)) {
      setError('Ticker must be 1–5 letters only.');
      return;
    }
    setError('');
    const err = await onAdd(ticker);
    if (err) {
      setError(err);
    } else {
      setInput('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAdd();
  };

  return (
    <div className="w-[280px] shrink-0 border-l border-zinc-800 bg-[#050505] flex flex-col h-full" data-testid="watchlist-panel">
      {/* Header */}
      <div className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold font-mono">Watchlist</div>
          <div className="font-mono text-xs text-zinc-300 mt-0.5" data-testid="watchlist-count">
            {watchlist.length}<span className="text-zinc-600">/10</span>
          </div>
        </div>
        {watchlist.length > 0 && (
          <span className="text-[9px] font-mono uppercase tracking-widest text-[#0066FF] border border-[#0066FF]/30 px-2 py-0.5">
            FILTER ACTIVE
          </span>
        )}
      </div>

      {/* Add ticker input */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => { setInput(e.target.value.toUpperCase()); setError(''); }}
            onKeyDown={handleKeyDown}
            placeholder="Add ticker..."
            maxLength={5}
            disabled={watchlist.length >= 10}
            className="flex-1 bg-black border border-zinc-800 focus:border-[#0066FF] focus:outline-none text-white text-xs font-mono px-2.5 py-2 placeholder-zinc-700 transition-colors duration-75 disabled:opacity-40"
            data-testid="watchlist-input"
          />
          <button
            onClick={handleAdd}
            disabled={!input.trim() || watchlist.length >= 10}
            className="bg-[#0066FF] hover:bg-[#0052CC] disabled:opacity-40 disabled:cursor-not-allowed text-white px-2.5 py-2 transition-colors duration-75"
            data-testid="watchlist-add-button"
          >
            <Plus size={14} />
          </button>
        </div>
        {error && (
          <div className="flex items-center gap-1.5 mt-2" data-testid="watchlist-error">
            <AlertCircle size={11} className="text-[#FF3333]" />
            <span className="text-[#FF3333] text-[11px] font-mono">{error}</span>
          </div>
        )}
        {watchlist.length >= 10 && (
          <p className="text-zinc-600 text-[11px] font-mono mt-2">Max 10 companies reached.</p>
        )}
      </div>

      {/* Ticker list */}
      <div className="flex-1 overflow-y-auto" data-testid="watchlist-tickers">
        {watchlist.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="text-zinc-700 text-xs font-mono leading-relaxed">
              Add up to 10 tickers to filter your alert feed.
            </div>
          </div>
        ) : (
          <div className="py-1">
            {watchlist.map(ticker => (
              <div
                key={ticker}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-zinc-900 group transition-colors duration-75"
                data-testid={`watchlist-item-${ticker}`}
              >
                <span className="font-mono font-bold text-sm text-white">{ticker}</span>
                <button
                  onClick={() => onRemove(ticker)}
                  className="text-zinc-700 hover:text-[#FF3333] opacity-0 group-hover:opacity-100 transition-all duration-75"
                  data-testid={`watchlist-remove-${ticker}`}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer note */}
      <div className="border-t border-zinc-800 px-4 py-3">
        <p className="text-[10px] text-zinc-700 font-mono leading-relaxed">
          {watchlist.length > 0
            ? `Showing alerts for ${watchlist.length} compan${watchlist.length === 1 ? 'y' : 'ies'} only.`
            : 'Showing all signals.'}
        </p>
      </div>
    </div>
  );
}
