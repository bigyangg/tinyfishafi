// components/SignalDetailModal.jsx — Signal detail modal overlay
// Purpose: Shows full signal details when an alert card is clicked
// Dependencies: lucide-react

import { X, ExternalLink } from 'lucide-react';

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

export default function SignalDetailModal({ signal, onClose }) {
    if (!signal) return null;

    const { ticker, filing_type, classification, company_name, summary, confidence, filed_at, accession_number, edgar_url } = signal;
    const badgeStyle = BADGE_STYLES[classification] || BADGE_STYLES.Neutral;
    const dotStyle = SIGNAL_DOTS[classification] || SIGNAL_DOTS.Neutral;

    const formatDate = (iso) => {
        try {
            const d = new Date(iso);
            return d.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
        } catch {
            return iso;
        }
    };

    const formatTime = (iso) => {
        try {
            return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
        } catch {
            return '';
        }
    };

    // Build EDGAR URL from accession number
    const edgarLink = edgar_url || (accession_number
        ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${accession_number}&type=8-K&dateb=&owner=include&count=10`
        : null);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="signal-modal-overlay">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-[#0A0A0A] border border-zinc-800 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" data-testid="signal-modal">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                    <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-white text-lg tracking-wide">{ticker}</span>
                        <span className={`flex items-center gap-1.5 text-[10px] font-mono font-bold px-2 py-0.5 uppercase tracking-wider ${badgeStyle}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${dotStyle}`}></span>
                            {classification}
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-zinc-600 hover:text-white transition-colors duration-75"
                        data-testid="signal-modal-close"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-5">
                    {/* Company */}
                    <div>
                        <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-mono mb-1">Company</div>
                        <div className="text-white text-sm">{company_name}</div>
                    </div>

                    {/* Filing Type */}
                    <div className="flex items-center gap-6">
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-mono mb-1">Filing Type</div>
                            <span className="bg-zinc-900 border border-zinc-800 text-zinc-400 text-[10px] font-mono px-2 py-0.5 uppercase tracking-wider">
                                {filing_type}
                            </span>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-mono mb-1">Confidence</div>
                            <span className="font-mono text-white text-sm">{confidence}%</span>
                        </div>
                    </div>

                    {/* Summary */}
                    <div>
                        <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-mono mb-1">Summary</div>
                        <p className="text-zinc-300 text-sm leading-relaxed">{summary}</p>
                    </div>

                    {/* Filed Date */}
                    <div className="flex items-center gap-6">
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-mono mb-1">Filed Date</div>
                            <div className="text-zinc-300 text-sm font-mono">{formatDate(filed_at)}</div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-mono mb-1">Time</div>
                            <div className="text-zinc-300 text-sm font-mono">{formatTime(filed_at)}</div>
                        </div>
                    </div>

                    {/* Accession Number */}
                    {accession_number && (
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-mono mb-1">Accession Number</div>
                            <div className="text-zinc-500 text-xs font-mono">{accession_number}</div>
                        </div>
                    )}

                    {/* EDGAR Link */}
                    {edgarLink && (
                        <a
                            href={edgarLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 bg-[#0066FF]/10 border border-[#0066FF]/20 text-[#0066FF] text-xs font-mono px-4 py-2.5 hover:bg-[#0066FF]/20 transition-colors duration-75"
                            data-testid="signal-modal-edgar-link"
                        >
                            <ExternalLink size={12} />
                            View on SEC EDGAR
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
}
