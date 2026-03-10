// components/AlertCard.jsx — Signal card component (clickable)
// Purpose: Renders one signal alert with hover affordance, confidence bar, animation

import { ChevronRight } from 'lucide-react';

const BADGE_STYLES = {
  Positive: 'bg-[#00C805]/10 text-[#00C805] border border-[#00C805]/20',
  Risk: 'bg-[#FF3333]/10 text-[#FF3333] border border-[#FF3333]/20',
  Neutral: 'bg-zinc-800 text-zinc-400 border border-zinc-700',
  Pending: 'bg-yellow-900/20 text-yellow-500 border border-yellow-700/30',
};

const SIGNAL_DOTS = {
  Positive: 'bg-[#00C805]',
  Risk: 'bg-[#FF3333]',
  Neutral: 'bg-zinc-500',
  Pending: 'bg-yellow-500',
};

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

function confidenceColor(confidence) {
  if (confidence >= 80) return '#00C805';
  if (confidence >= 50) return '#F59E0B';
  return '#FF3333';
}

export default function AlertCard({ signal, onClick, isNew }) {
  const { ticker, filing_type, classification, company_name, summary, confidence, filed_at } = signal;
  const badgeStyle = BADGE_STYLES[classification] || BADGE_STYLES.Neutral;
  const dotStyle = SIGNAL_DOTS[classification] || SIGNAL_DOTS.Neutral;
  const confColor = confidenceColor(confidence);

  return (
    <div
      className={`bg-[#0A0A0A] border border-zinc-800 hover:border-zinc-600 p-5 transition-all duration-75 cursor-pointer group ${isNew ? 'signal-new' : ''}`}
      data-testid={`alert-card-${signal.id}`}
      onClick={() => onClick && onClick(signal)}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono font-bold text-white text-sm tracking-wide" data-testid={`ticker-${signal.id}`}>
          {ticker}
        </span>
        <span className="bg-zinc-900 border border-zinc-800 text-zinc-400 text-[10px] font-mono px-2 py-0.5 uppercase tracking-wider">
          {filing_type}
        </span>
        <span
          className={`flex items-center gap-1.5 text-[10px] font-mono font-bold px-2 py-0.5 uppercase tracking-wider ${badgeStyle}`}
          data-testid={`signal-badge-${signal.id}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${dotStyle}`}></span>
          {classification}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex flex-col items-end">
            <span className="font-mono text-[11px] text-zinc-300" data-testid={`confidence-${signal.id}`}>
              {confidence}%
            </span>
            {/* Confidence bar */}
            <div className="w-12 h-[2px] bg-zinc-800 mt-1">
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${confidence}%`,
                  backgroundColor: confColor,
                }}
              ></div>
            </div>
          </div>
          <span className="text-[9px] uppercase tracking-widest text-zinc-600 font-mono">conf</span>
        </div>
      </div>

      {/* Summary */}
      <p className="text-zinc-400 text-sm leading-relaxed mb-4" data-testid={`summary-${signal.id}`}>
        {summary}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-zinc-600 text-xs font-mono" data-testid={`company-${signal.id}`}>
          {company_name}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-zinc-700 text-[11px] font-mono" data-testid={`timestamp-${signal.id}`}>
            {relativeTime(filed_at)}
          </span>
          {/* Hover affordance */}
          <ChevronRight
            size={12}
            className="text-zinc-700 opacity-0 group-hover:opacity-100 group-hover:text-[#0066FF] transition-all duration-75"
          />
        </div>
      </div>
    </div>
  );
}
