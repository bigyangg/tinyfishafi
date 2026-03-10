// components/AlertCard.jsx — Signal card component (clickable)
// Purpose: Renders one signal alert. Clicking opens the detail modal.

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

function formatTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffH = Math.floor(diffMs / 3600000);
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AlertCard({ signal, onClick }) {
  const { ticker, filing_type, classification, company_name, summary, confidence, filed_at } = signal;
  const badgeStyle = BADGE_STYLES[classification] || BADGE_STYLES.Neutral;
  const dotStyle = SIGNAL_DOTS[classification] || SIGNAL_DOTS.Neutral;

  return (
    <div
      className="bg-[#0A0A0A] border border-zinc-800 hover:border-zinc-600 p-5 transition-colors duration-75 cursor-pointer"
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
          <span className="font-mono text-[11px] text-zinc-300" data-testid={`confidence-${signal.id}`}>
            {confidence}%
          </span>
          <span className="text-[9px] uppercase tracking-widest text-zinc-600 font-mono">confidence</span>
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
        <span className="text-zinc-700 text-[11px] font-mono" data-testid={`timestamp-${signal.id}`}>
          {formatTime(filed_at)}
        </span>
      </div>
    </div>
  );
}
