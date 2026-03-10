import { Link, useNavigate } from 'react-router-dom';
import { Check, ArrowRight, Mail } from 'lucide-react';

const TIERS = [
  {
    id: 'retail',
    name: 'Retail',
    price: '$19',
    period: '/mo',
    description: 'For individual investors tracking key positions.',
    cta: 'Start Free Trial',
    ctaAction: 'signup',
    featured: false,
    features: [
      '8-K alerts only',
      'Plain English AI summary',
      '3-class signal (Positive / Neutral / Risk)',
      'Up to 10 companies watchlist',
      'Telegram + Email notifications',
      'Basic dashboard',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$99',
    period: '/mo',
    description: 'For active traders who need full regulatory depth.',
    cta: 'Start Free Trial',
    ctaAction: 'signup',
    featured: true,
    features: [
      'All filing types (8-K, 10-K, 10-Q, S-1)',
      'Full summary + diff viewer',
      'Signal + confidence + rationale',
      'Unlimited companies',
      'Telegram + Email + Webhook',
      'Full dashboard + diff viewer',
      'Sector & market cap filters',
      'CRTS data export',
      'REST API (500 calls/day)',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For firms, funds, and institutional desks.',
    cta: 'Contact Us',
    ctaAction: 'contact',
    featured: false,
    features: [
      'Everything in Pro',
      'Unlimited API access + licensing rights',
      'Form 4 insider intelligence',
      'White-label + embedded widget',
      'Dedicated webhook + 99.9% SLA',
      'Priority support',
    ],
  },
];

export default function Pricing() {
  const navigate = useNavigate();

  const handleCta = (tier) => {
    if (tier.ctaAction === 'contact') {
      window.location.href = 'mailto:hello@afi.ai';
    } else {
      navigate('/auth?mode=signup');
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white" data-testid="pricing-page">
      {/* Nav */}
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between sticky top-0 bg-[#050505] z-50">
        <Link to="/" className="font-mono font-bold text-lg text-white tracking-wider" data-testid="pricing-nav-logo">AFI</Link>
        <div className="flex items-center gap-3">
          <Link to="/auth" className="text-sm text-zinc-400 hover:text-white transition-colors duration-75 px-3 py-2" data-testid="pricing-nav-login">
            Log In
          </Link>
          <button
            onClick={() => navigate('/auth?mode=signup')}
            className="bg-[#0066FF] hover:bg-[#0052CC] text-white text-sm font-medium px-4 py-2 transition-colors duration-75"
            data-testid="pricing-nav-cta"
          >
            Start Free Trial
          </button>
        </div>
      </nav>

      {/* Header */}
      <section className="px-6 py-20 max-w-5xl mx-auto text-center" data-testid="pricing-header">
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold font-mono mb-4">Pricing</div>
        <h1 className="font-sans font-bold text-4xl md:text-5xl text-white mb-4 tracking-tight">
          The regulatory edge.<br />At every price point.
        </h1>
        <p className="text-zinc-500 text-base max-w-xl mx-auto">
          From retail investors to institutional desks. No Bloomberg contract required.
        </p>
      </section>

      {/* Tier cards */}
      <section className="px-6 pb-24 max-w-5xl mx-auto" data-testid="pricing-tiers">
        <div className="grid md:grid-cols-3 gap-px bg-zinc-800">
          {TIERS.map(tier => (
            <div
              key={tier.id}
              className={`flex flex-col p-8 relative ${
                tier.featured
                  ? 'bg-[#0A0A0A] border-t-2 border-[#0066FF]'
                  : 'bg-[#050505]'
              }`}
              data-testid={`tier-${tier.id}`}
            >
              {tier.featured && (
                <div className="absolute top-0 right-6 -translate-y-1/2">
                  <span className="bg-[#0066FF] text-white text-[10px] font-mono font-bold px-3 py-1 uppercase tracking-wider">
                    Most Popular
                  </span>
                </div>
              )}

              {/* Tier header */}
              <div className="mb-8">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold font-mono mb-2" data-testid={`tier-name-${tier.id}`}>
                  {tier.name}
                </div>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="font-mono font-bold text-4xl text-white" data-testid={`tier-price-${tier.id}`}>{tier.price}</span>
                  {tier.period && <span className="text-zinc-500 text-sm font-mono">{tier.period}</span>}
                </div>
                <p className="text-zinc-500 text-sm leading-relaxed">{tier.description}</p>
              </div>

              {/* CTA */}
              <button
                onClick={() => handleCta(tier)}
                className={`flex items-center justify-center gap-2 py-2.5 text-sm font-medium mb-8 transition-colors duration-75 ${
                  tier.featured
                    ? 'bg-[#0066FF] hover:bg-[#0052CC] text-white'
                    : tier.ctaAction === 'contact'
                    ? 'border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white bg-transparent'
                    : 'border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white bg-transparent'
                }`}
                data-testid={`tier-cta-${tier.id}`}
              >
                {tier.ctaAction === 'contact' ? <Mail size={14} /> : <ArrowRight size={14} />}
                {tier.cta}
              </button>

              {/* Feature list */}
              <div className="space-y-3 flex-1">
                {tier.features.map(f => (
                  <div key={f} className="flex items-start gap-2.5" data-testid={`feature-${tier.id}-${f.slice(0, 10).replace(/\s+/g, '-').toLowerCase()}`}>
                    <Check size={13} className={`mt-0.5 shrink-0 ${tier.featured ? 'text-[#0066FF]' : 'text-zinc-500'}`} />
                    <span className="text-zinc-400 text-xs leading-relaxed">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Disclaimer */}
      <section className="border-t border-zinc-800 px-6 py-8" data-testid="pricing-disclaimer">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-zinc-700 text-xs font-mono leading-relaxed">
            AFI provides informational signals only. Not investment advice. Past signal accuracy does not guarantee future results.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-6 py-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link to="/" className="font-mono font-bold text-sm text-white">AFI</Link>
          <span className="text-zinc-700 text-xs">© 2026 Autonomous Filing Intelligence</span>
        </div>
      </footer>
    </div>
  );
}
