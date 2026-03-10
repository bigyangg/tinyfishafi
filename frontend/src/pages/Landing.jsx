import { Link, useNavigate } from 'react-router-dom';
import { Shield, Zap, BarChart2, ArrowRight, Clock, CheckCircle } from 'lucide-react';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '/pricing' },
];

const STATS = [
  { value: '3M+', label: 'SEC Filings / Year' },
  { value: '<10min', label: 'Alert Latency P95' },
  { value: '500+', label: 'Companies Monitored' },
  { value: '3-Class', label: 'Signal Scoring' },
];

const FEATURES = [
  {
    icon: Zap,
    title: 'Autonomous Surveillance',
    desc: 'AFI monitors EDGAR 24/7. The moment an 8-K drops, the agent triggers — no cron jobs, no delays.',
  },
  {
    icon: BarChart2,
    title: 'AI Signal Scoring',
    desc: 'Every filing gets classified as Positive, Neutral, or Risk with a confidence score. Plain English, not legalese.',
  },
  {
    icon: Shield,
    title: 'Regulatory Memory',
    desc: 'AFI tracks executive turnover, risk factor drift, and filing tone over time — building a longitudinal risk profile per company.',
  },
];

const HOW_IT_WORKS = [
  { step: '01', title: 'EDGAR Publishes', desc: 'SEC filing goes live. AFI detects it in under 2 minutes.' },
  { step: '02', title: 'AI Processes', desc: 'Claude Sonnet reads, classifies, and scores the signal. 300-word plain English summary generated.' },
  { step: '03', title: 'You Get Alerted', desc: 'Structured intelligence hits your dashboard and Telegram before the news cycle picks it up.' },
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      {/* NAV */}
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between sticky top-0 bg-[#050505] z-50" data-testid="landing-nav">
        <Link to="/" className="font-mono font-bold text-lg text-white tracking-wider" data-testid="nav-logo">AFI</Link>
        <div className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map(l => (
            <Link
              key={l.label}
              to={l.href}
              className="text-sm text-zinc-400 hover:text-white transition-colors duration-75"
              data-testid={`nav-${l.label.toLowerCase()}`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/auth"
            className="text-sm text-zinc-400 hover:text-white transition-colors duration-75 px-3 py-2"
            data-testid="nav-login"
          >
            Log In
          </Link>
          <button
            onClick={() => navigate('/auth?mode=signup')}
            className="bg-[#0066FF] hover:bg-[#0052CC] text-white text-sm font-medium px-4 py-2 transition-colors duration-75"
            data-testid="nav-cta"
          >
            Start Free Trial
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="px-6 py-24 md:py-36 max-w-5xl mx-auto" data-testid="hero-section">
        <div className="inline-flex items-center gap-2 border border-zinc-800 px-3 py-1 mb-8">
          <span className="w-1.5 h-1.5 bg-[#00C805] rounded-full"></span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">Phase 1 — Now Live</span>
        </div>
        <h1 className="font-sans font-bold text-5xl md:text-6xl lg:text-7xl tracking-tight text-white leading-[1.05] mb-6" data-testid="hero-headline">
          AI That Reads SEC<br />Filings So You Don't<br />Have To.
        </h1>
        <p className="text-zinc-400 text-lg max-w-xl mb-10 leading-relaxed" data-testid="hero-subheading">
          AFI monitors every EDGAR filing in real time, interprets it with AI, scores the signal, and delivers structured intelligence to your dashboard — in under 10 minutes.
        </p>
        <div className="flex items-center gap-4" data-testid="hero-ctas">
          <button
            onClick={() => navigate('/auth?mode=signup')}
            className="bg-[#0066FF] hover:bg-[#0052CC] text-white text-sm font-medium px-6 py-3 flex items-center gap-2 transition-colors duration-75"
            data-testid="hero-cta-primary"
          >
            Start Free Trial
            <ArrowRight size={14} />
          </button>
          <Link
            to="/pricing"
            className="text-sm text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 px-6 py-3 transition-colors duration-75"
            data-testid="hero-cta-secondary"
          >
            View Pricing
          </Link>
        </div>
      </section>

      {/* STATS BAR */}
      <section className="border-t border-b border-zinc-800 px-6 py-8" data-testid="stats-section">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map(s => (
            <div key={s.label} className="text-center" data-testid={`stat-${s.label.replace(/\s+/g, '-').toLowerCase()}`}>
              <div className="font-mono font-bold text-2xl text-white mb-1">{s.value}</div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="px-6 py-24 max-w-5xl mx-auto" data-testid="features-section">
        <div className="mb-12">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold font-mono mb-3">Why AFI</div>
          <h2 className="font-sans font-bold text-3xl text-white">Infrastructure-grade intelligence.<br />Retail price point.</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-px bg-zinc-800">
          {FEATURES.map(f => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="bg-[#050505] p-8" data-testid={`feature-${f.title.split(' ')[0].toLowerCase()}`}>
                <Icon size={20} className="text-[#0066FF] mb-4" />
                <h3 className="font-sans font-semibold text-white text-base mb-3">{f.title}</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-t border-zinc-800 px-6 py-24" data-testid="how-it-works-section">
        <div className="max-w-5xl mx-auto">
          <div className="mb-12">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold font-mono mb-3">The Loop</div>
            <h2 className="font-sans font-bold text-3xl text-white">From filing to intelligence in 3 steps.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map(h => (
              <div key={h.step} className="border-t-2 border-[#0066FF] pt-6" data-testid={`step-${h.step}`}>
                <div className="font-mono text-[10px] text-zinc-600 mb-4 uppercase tracking-widest">{h.step}</div>
                <h3 className="font-mono font-bold text-white text-sm uppercase tracking-wider mb-3">{h.title}</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">{h.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="border-t border-zinc-800 px-6 py-24" data-testid="bottom-cta-section">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div>
            <h2 className="font-sans font-bold text-3xl text-white mb-3">Start reading the filings that move markets.</h2>
            <p className="text-zinc-500 text-sm">No credit card required. Full dashboard access on signup.</p>
          </div>
          <button
            onClick={() => navigate('/auth?mode=signup')}
            className="bg-[#0066FF] hover:bg-[#0052CC] text-white text-sm font-medium px-8 py-3 flex items-center gap-2 transition-colors duration-75 shrink-0"
            data-testid="bottom-cta-button"
          >
            Start Free Trial
            <ArrowRight size={14} />
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-zinc-800 px-6 py-8" data-testid="footer">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-sm text-white">AFI</span>
            <span className="text-zinc-700 text-xs">Autonomous Filing Intelligence</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-zinc-600">
            <span>© 2026 AFI</span>
            <span className="hover:text-zinc-400 cursor-pointer transition-colors duration-75">Terms</span>
            <span className="hover:text-zinc-400 cursor-pointer transition-colors duration-75">Privacy</span>
            <span className="hover:text-zinc-400 cursor-pointer transition-colors duration-75">Disclaimer</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-600 font-mono">
            <CheckCircle size={10} className="text-[#00C805]" />
            <span>AFI not investment advice</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
