import { useNavigate } from 'react-router-dom';
import { Zap, BarChart2, Bell, ArrowRight, Activity, Shield, Cpu } from 'lucide-react';

const STATS = [
  { value: '<2min', label: 'Detection Speed' },
  { value: '8-K', label: 'Filing Coverage' },
  { value: '0–100', label: 'Impact Score' },
  { value: '24/7', label: 'SEC Monitoring' },
];

const FEATURES = [
  {
    icon: Zap,
    title: 'Real-Time Detection',
    desc: 'Continuous EDGAR monitoring detects new 8-K filings within 2 minutes of publication. No manual checking, no lag.',
    color: '#FFB300',
  },
  {
    icon: Cpu,
    title: 'AI Signal Classification',
    desc: 'Each filing is classified (Positive, Neutral, Risk), scored for market impact (0–100), and categorized by event type. One glance, full context.',
    color: '#00C805',
  },
  {
    icon: Bell,
    title: 'Multi-Channel Alerts',
    desc: 'Signals appear on your categorized dashboard in real time. High-impact alerts push to Telegram and browser notifications instantly.',
    color: '#0066FF',
  },
];

const STEPS = [
  { num: '01', title: 'Filing Detected', desc: 'SEC publishes an 8-K. AFI detects it within 2 minutes and extracts the full filing text from EDGAR.' },
  { num: '02', title: 'Signal Generated', desc: 'Filing is classified by AI, scored for impact, enriched with price data and news sentiment. Event type identified.' },
  { num: '03', title: 'Alert Delivered', desc: 'Structured signal appears on your categorized dashboard. High-impact events push to Telegram before news reacts.' },
];

export default function Landing() {
  const navigate = useNavigate();

  const btn = (primary) => ({
    padding: '12px 28px',
    background: primary ? '#0066FF' : 'transparent',
    border: primary ? '1px solid #0066FF' : '1px solid #2a2a2a',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
    fontFamily: "'Inter', sans-serif",
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    letterSpacing: '0.02em',
    boxShadow: primary ? '0 0 16px rgba(0, 102, 255, 0.25)' : 'none',
  });

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#030303',
      color: '#fff',
      fontFamily: "'Inter', sans-serif",
      position: 'relative'
    }}>
      {/* CSS Animations & Utilities */}
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-up {
          animation: fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
        }
        .delay-1 { animation-delay: 0.1s; }
        .delay-2 { animation-delay: 0.2s; }
        .delay-3 { animation-delay: 0.3s; }
        
        .feature-card:hover {
          transform: translateY(-4px);
          border-color: #333 !important;
        }
        .step-card:hover .step-num {
          color: #222 !important;
          transform: scale(1.05);
        }
      `}</style>

      {/* Background Dot Grid with Top Mask */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: 'radial-gradient(#222 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        opacity: 0.5,
        maskImage: 'linear-gradient(to bottom, black 0%, transparent 80%)',
        WebkitMaskImage: 'linear-gradient(to bottom, black 0%, transparent 80%)',
        pointerEvents: 'none',
        zIndex: 0
      }} />

      {/* ── NAV ── */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 32px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(3, 3, 3, 0.7)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', zIndex: 10 }}>
          <span style={{ fontWeight: 900, fontSize: '18px', letterSpacing: '0.1em', color: '#fff' }}>AFI</span>
          <span style={{ fontSize: '10px', color: '#555', letterSpacing: '0.08em', borderLeft: '1px solid #222', paddingLeft: '12px', fontWeight: 600 }}>
            MARKET INTELLIGENCE
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', zIndex: 10 }}>
          <button
            onClick={() => navigate('/auth')}
            style={{ ...btn(false), padding: '8px 16px', fontSize: '13px', border: 'none', color: '#888', boxShadow: 'none' }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = '#888'}
          >
            Log In
          </button>
          <button
            onClick={() => navigate('/auth?mode=signup')}
            style={{ ...btn(true), padding: '8px 20px', fontSize: '13px' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0052CC'; e.currentTarget.style.boxShadow = '0 0 24px rgba(0, 102, 255, 0.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#0066FF'; e.currentTarget.style.boxShadow = '0 0 16px rgba(0, 102, 255, 0.25)'; }}
          >
            Get Started <ArrowRight size={14} />
          </button>
        </div>
      </nav>

      <div style={{ position: 'relative', zIndex: 10 }}>
        {/* ── HERO ── */}
        <section style={{ maxWidth: '900px', margin: '0 auto', padding: '100px 32px 80px', textAlign: 'center' }}>

          <div className="animate-fade-up" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'rgba(0, 200, 5, 0.08)', border: '1px solid rgba(0, 200, 5, 0.2)',
            borderRadius: '24px', padding: '6px 16px', marginBottom: '32px',
            backdropFilter: 'blur(4px)',
          }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00C805', boxShadow: '0 0 8px #00C805', animation: 'pulse-green 2s ease-in-out infinite' }} />
            <span style={{ fontSize: '11px', color: '#00C805', fontWeight: 700, letterSpacing: '0.1em' }}>
              MONITORING EDGAR — LIVE
            </span>
          </div>

          <h1 className="animate-fade-up delay-1" style={{
            fontSize: 'clamp(40px, 6vw, 76px)',
            fontWeight: 800,
            lineHeight: 1.05,
            marginBottom: '28px',
            letterSpacing: '-0.03em',
            background: 'linear-gradient(180deg, #ffffff 30%, #777777 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 4px 24px rgba(255,255,255,0.05))'
          }}>
            Autonomous Market<br />Event Intelligence.
          </h1>

          <p className="animate-fade-up delay-2" style={{
            fontSize: '18px', color: '#888', maxWidth: '640px', margin: '0 auto 48px',
            lineHeight: 1.6, fontWeight: 400,
          }}>
            AFI detects SEC 8-K filings the moment they drop, classifies the market event with high-speed AI, scores impact, and delivers signals to your dashboard and Telegram — before the news cycle reacts.
          </p>

          <div className="animate-fade-up delay-3" style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/auth?mode=signup')}
              style={{ ...btn(true), padding: '14px 32px', fontSize: '15px' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#0052CC'; e.currentTarget.style.boxShadow = '0 0 32px rgba(0, 102, 255, 0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#0066FF'; e.currentTarget.style.boxShadow = '0 0 16px rgba(0, 102, 255, 0.25)'; }}
            >
              Start Monitoring
            </button>
            <button
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              style={{ ...btn(false), padding: '14px 32px', fontSize: '15px' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#111'; e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#fff'; }}
            >
              See How It Works
            </button>
          </div>
        </section>

        {/* ── STATS BAR ── */}
        <section style={{ borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.3)' }}>
          <div style={{
            maxWidth: '1000px', margin: '0 auto',
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          }}>
            {STATS.map((s, i) => (
              <div key={s.label} style={{
                textAlign: 'center', padding: '32px 16px',
                borderRight: i < 3 ? '1px solid rgba(255,255,255,0.05)' : 'none',
              }}>
                <div style={{ fontSize: '32px', fontWeight: 800, color: '#fff', marginBottom: '8px', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em', textShadow: '0 0 20px rgba(255,255,255,0.1)' }}>
                  {s.value}
                </div>
                <div style={{ fontSize: '10px', color: '#666', letterSpacing: '0.15em', fontWeight: 600, textTransform: 'uppercase' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── FEATURES ── */}
        <section id="features" style={{ maxWidth: '1000px', margin: '0 auto', padding: '100px 32px' }}>
          <div style={{ marginBottom: '64px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Shield size={14} color="#0066FF" />
              <span style={{ fontSize: '10px', color: '#0066FF', letterSpacing: '0.15em', fontWeight: 700 }}>INSTITUTIONAL GRADE</span>
            </div>
            <h2 style={{ fontSize: '36px', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
              Signal infrastructure.<br />
              <span style={{ color: '#666' }}>Built for individual traders.</span>
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            {FEATURES.map((f, i) => (
              <div key={f.title} className="feature-card animate-fade-up" style={{
                background: 'linear-gradient(180deg, #0a0a0a 0%, #050505 100%)',
                border: '1px solid #161616',
                borderRadius: '12px',
                padding: '32px 28px',
                position: 'relative',
                overflow: 'hidden',
                animationDelay: `${i * 0.15}s`,
                transition: 'all 300ms ease',
                boxShadow: '0 4px 24px rgba(0,0,0,0.5)'
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: f.color, opacity: 0.8, boxShadow: `0 0 12px ${f.color}` }} />
                <div style={{
                  width: '48px', height: '48px', borderRadius: '8px', background: `${f.color}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px',
                  border: `1px solid ${f.color}30`
                }}>
                  <f.icon size={22} color={f.color} strokeWidth={2} />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px', color: '#fff', letterSpacing: '-0.01em' }}>{f.title}</h3>
                <p style={{ fontSize: '14px', color: '#888', lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── PIPELINE (HOW IT WORKS) ── */}
        <section style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '100px 32px', background: 'radial-gradient(circle at 50% 0%, #0a0a0a 0%, #030303 100%)' }}>
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ marginBottom: '64px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Activity size={14} color="#0066FF" />
                <span style={{ fontSize: '10px', color: '#0066FF', letterSpacing: '0.15em', fontWeight: 700 }}>THE PIPELINE</span>
              </div>
              <h2 style={{ fontSize: '36px', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
                From SEC filing to actionable signal.
              </h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
              {STEPS.map((h, i) => (
                <div key={h.num} className="step-card" style={{
                  background: '#080808', border: '1px solid #161616', borderRadius: '12px',
                  padding: '32px 28px', position: 'relative', overflow: 'hidden',
                  transition: 'border-color 300ms ease',
                }}>
                  <div className="step-num" style={{
                    position: 'absolute', top: '16px', right: '20px',
                    fontSize: '64px', fontWeight: 900, color: '#111', lineHeight: 1,
                    fontFamily: "'JetBrains Mono', monospace",
                    transition: 'all 300ms ease', pointerEvents: 'none'
                  }}>
                    {h.num}
                  </div>
                  <div style={{
                    width: '40px', height: '4px', background: '#0066FF', borderRadius: '2px',
                    marginBottom: '24px', boxShadow: '0 0 12px rgba(0,102,255,0.4)',
                    position: 'relative', zIndex: 1
                  }} />
                  <h3 style={{
                    fontSize: '13px', fontWeight: 800, letterSpacing: '0.08em',
                    marginBottom: '16px', color: '#ddd', textTransform: 'uppercase',
                    position: 'relative', zIndex: 1
                  }}>
                    {h.title}
                  </h3>
                  <p style={{ fontSize: '14px', color: '#777', lineHeight: 1.6, margin: 0, position: 'relative', zIndex: 1 }}>{h.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '100px 32px' }}>
          <div style={{
            maxWidth: '800px', margin: '0 auto', textAlign: 'center',
            background: 'linear-gradient(180deg, #0c0c0c 0%, #050505 100%)',
            border: '1px solid #1a1a1a',
            borderRadius: '16px',
            padding: '64px 40px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
            position: 'relative', overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: 0, left: '20%', right: '20%', height: '1px', background: 'linear-gradient(90deg, transparent, #0066FF, transparent)', opacity: 0.5, boxShadow: '0 0 20px #0066FF' }} />

            <h2 style={{ fontSize: '32px', fontWeight: 800, marginBottom: '16px', letterSpacing: '-0.02em', color: '#fff' }}>
              Stop reacting to headlines.
            </h2>
            <p style={{ fontSize: '18px', color: '#888', marginBottom: '40px', maxWidth: '500px', margin: '0 auto 40px', lineHeight: 1.5 }}>
              Start reading the filings. Free to start. Full dashboard access. Real-time signals from day one.
            </p>
            <button
              onClick={() => navigate('/auth?mode=signup')}
              style={{ ...btn(true), fontSize: '16px', padding: '16px 40px', borderRadius: '8px' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#0052CC'; e.currentTarget.style.boxShadow = '0 0 40px rgba(0, 102, 255, 0.5)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#0066FF'; e.currentTarget.style.boxShadow = '0 0 16px rgba(0, 102, 255, 0.25)'; }}
            >
              Start Monitoring
            </button>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '32px 32px', background: '#020202' }}>
          <div style={{
            maxWidth: '1000px', margin: '0 auto',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexWrap: 'wrap', gap: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 900, fontSize: '14px', letterSpacing: '0.05em' }}>AFI</span>
              <span style={{ fontSize: '11px', color: '#444' }}>Autonomous Market Intelligence</span>
            </div>
            <div style={{ display: 'flex', gap: '24px', fontSize: '12px', color: '#555' }}>
              <span>© 2026 AFI</span>
              <span style={{ cursor: 'pointer', transition: 'color 150ms' }} onMouseEnter={e => e.target.style.color = '#fff'} onMouseLeave={e => e.target.style.color = '#555'}>Terms</span>
              <span style={{ cursor: 'pointer', transition: 'color 150ms' }} onMouseEnter={e => e.target.style.color = '#fff'} onMouseLeave={e => e.target.style.color = '#555'}>Privacy</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#555' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00C805', opacity: 0.8 }} />
              <span>Not investment advice</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
