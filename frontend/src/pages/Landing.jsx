import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=JetBrains+Mono:wght@500;600;700;800&display=swap');

:root {
  --bg: #060A12;
  --bg-raised: #0A0D14;
  --bg-card: #0D1117;
  --border: #1C2333;
  --border-hi: #243044;
  --text-1: #F0F6FF;
  --text-2: #8B9EB0;
  --text-3: #4A5568;
  --blue: #3B82F6;
  --blue-dim: #1D3557;
  --green: #22C55E;
  --red: #EF4444;
  --amber: #F59E0B;
  --purple: #8B5CF6;
  --font-ui: 'Inter', -apple-system, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: var(--bg); color: var(--text-1); font-family: var(--font-ui); overflow-x: hidden; }

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
  50% { opacity: 0.7; box-shadow: 0 0 0 4px rgba(34,197,94,0); }
}

@keyframes tape-left {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

@keyframes tape-right {
  from { transform: translateX(-50%); }
  to { transform: translateX(0); }
}

.hero-eyebrow { animation: fadeUp 0.4s ease forwards; }
.hero-headline { animation: fadeUp 0.5s ease 0.1s forwards; opacity: 0; }
.hero-sub { animation: fadeUp 0.4s ease 0.2s forwards; opacity: 0; }
.hero-ctas { animation: fadeUp 0.4s ease 0.3s forwards; opacity: 0; }
.hero-stats { animation: fadeUp 0.4s ease 0.4s forwards; opacity: 0; }

.tape { display: flex; white-space: nowrap; width: max-content; }
.tape:hover .tape-row { animation-play-state: paused; }

.tape-row-left { animation: tape-left 150s linear infinite; }
.tape-row-right { animation: tape-right 120s linear infinite; }

.mono { font-family: var(--font-mono); }

/* Buttons */
.btn-primary {
  background: var(--blue); color: #fff; font-size: 14px; font-weight: 600; padding: 10px 22px; border-radius: 6px; border: none; cursor: pointer; letter-spacing: -0.01em; transition: background 150ms, transform 100ms;
}
.btn-primary:hover { background: #2563EB; }
.btn-primary:active { transform: scale(0.97); }

.btn-secondary {
  background: transparent; border: none; font-size: 14px; font-weight: 400; color: var(--text-3); cursor: pointer; padding: 0; transition: color 150ms;
}
.btn-secondary:hover { color: var(--text-2); }
.btn-secondary .arrow { display: inline-block; transition: transform 150ms; }
.btn-secondary:hover .arrow { transform: translateX(3px); }

/* Nav Links */
.nav-link { font-size: 13px; font-weight: 400; color: var(--text-2); text-decoration: none; transition: color 120ms; }
.nav-link:hover { color: var(--text-1); }

/* IntersectionObserver reveal */
.reveal { opacity: 0; transform: translateY(16px); transition: opacity 0.6s ease, transform 0.6s ease; }
.reveal.is-visible { opacity: 1; transform: translateY(0); }

@media (max-width: 768px) {
  .hero-grid { grid-template-columns: 1fr !important; padding: 0 32px !important; }
  .hero-headline { font-size: clamp(36px, 8vw, 52px) !important; }
  .terminal-wrapper { max-height: 340px; overflow-y: auto; }
  .nav-center { display: none !important; }
  .nav-mobile-btn { display: block !important; }
  .how-grid { grid-template-columns: 1fr !important; }
  .step-card { border-right: none !important; border-bottom: 1px solid var(--border); }
  .cap-grid { grid-template-columns: 1fr !important; }
  .metrics-grid { grid-template-columns: repeat(2, 1fr) !important; }
  .cta-email-row { flex-direction: column; }
  .cta-input, .cta-btn { width: 100% !important; }
  .footer-flex { flex-direction: column; gap: 16px; text-align: center; }
}

@media (min-width: 769px) and (max-width: 1024px) {
  .how-grid { grid-template-columns: repeat(2, 1fr) !important; }
  .cap-grid { grid-template-columns: repeat(2, 1fr) !important; }
}
`;

// TICKER DATA
const TICKERS = [
  {
    ticker: 'NVDA', form: '8-K', conf: 87, impact: 84,
    signal: 'POSITIVE', event: 'EARNINGS_BEAT',
    summary: 'Q4 revenue $39.3B, +78% YoY.',
    why: 'AI demand sustained → chip dominance reinforced',
    chains: ['↑ TSM', '↑ ASML', '↓ AMD', '↓ INTC']
  },
  {
    ticker: 'TSLA', form: '4', conf: 74, impact: 61,
    signal: 'POSITIVE', event: 'INSIDER_BUY',
    summary: 'Musk purchased 1.2M shares, net $218.9M.',
    why: 'CEO buying own stock → strongest confidence signal',
    chains: ['↑ RIVN', '↓ GM', '→ LCID']
  },
  {
    ticker: 'COIN', form: 'SC 13D', conf: 71, impact: 68,
    signal: 'RISK', event: 'ACTIVIST_ENTRY',
    summary: 'Starboard 8.3% stake, cites governance issues.',
    why: 'Activist pressure → restructuring likely in 90 days',
    chains: ['↓ SQ', '↓ HOOD', '→ MSTR']
  }
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

class Typewriter {
  constructor(el, text, speed = 11) {
    this.el = el;
    this.text = text;
    this.speed = speed;
  }
  start() {
    return new Promise(resolve => {
      let i = 0;
      this.el.textContent = '';
      const tick = setInterval(() => {
        this.el.textContent += this.text[i++];
        if (i >= this.text.length) {
          clearInterval(tick);
          resolve();
        }
      }, this.speed);
    });
  }
}

// Reveal Hook
function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const delay = entry.target.dataset.delay || 0;
            setTimeout(() => {
              entry.target.classList.add('is-visible');
            }, delay * 1000);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2, rootMargin: '0px 0px -32px 0px' }
    );
    els.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

export default function Landing() {
  useScrollReveal();

  return (
    <>
      <style>{CSS}</style>
      <Nav />
      <Hero />
      <TickerTape />
      <TheProblem />
      <HowItWorks />
      <Capabilities />
      <LiveSignals />
      <Metrics />
      <FinalCta />
      <Footer />
    </>
  );
}

function Nav() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef(null);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const handler = () => {
      if (window.scrollY > 60) {
        nav.style.background = 'rgba(6,10,18,0.97)';
        nav.style.borderBottom = '1px solid #1C2333';
      } else {
        nav.style.background = 'rgba(6,10,18,0.9)';
        nav.style.borderBottom = '1px solid rgba(28,35,51,0.8)';
      }
    };
    window.addEventListener('scroll', handler, { passive: true });
    handler();
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <nav ref={navRef} style={{
      height: 52, background: 'rgba(6,10,18,0.9)', backdropFilter: 'blur(16px) saturate(180%)',
      borderBottom: '1px solid rgba(28,35,51,0.8)', position: 'sticky', top: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 80px'
    }}>
      <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.01em', color: 'var(--text-1)' }}>AFI</div>
      
      <div className="nav-center" style={{ display: 'flex', gap: 32 }}>
        <a href="#features" className="nav-link">Features</a>
        <a href="#how" className="nav-link">How it works</a>
        <a href="#demo" className="nav-link">Signals</a>
        <a href="#pricing" className="nav-link">Pricing</a>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button className="nav-center" onClick={() => navigate('/auth')} style={{
          background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 13, cursor: 'pointer', transition: 'color 120ms'
        }} onMouseEnter={e => e.target.style.color = 'var(--text-2)'} onMouseLeave={e => e.target.style.color = 'var(--text-3)'}>
          Sign in
        </button>
        <button onClick={() => navigate('/auth?mode=signup')} style={{
          background: 'var(--text-1)', color: 'var(--bg)', fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 5, border: 'none', cursor: 'pointer', transition: 'background 120ms'
        }} onMouseEnter={e => e.target.style.background = '#FFF'} onMouseLeave={e => e.target.style.background = 'var(--text-1)'}>
          Get access
        </button>
        <button className="nav-mobile-btn" style={{ display: 'none', background: 'none', border: 'none', color: 'var(--text-1)', fontSize: 20, cursor: 'pointer' }} onClick={() => setMenuOpen(!menuOpen)}>
          ☰
        </button>
      </div>

      {menuOpen && (
        <div style={{ position: 'fixed', top: 52, left: 0, right: 0, bottom: 0, background: 'var(--bg)', zIndex: 99, display: 'flex', flexDirection: 'column', padding: 32, gap: 24 }}>
          <a href="#features" className="nav-link" onClick={() => setMenuOpen(false)}>Features</a>
          <a href="#how" className="nav-link" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#demo" className="nav-link" onClick={() => setMenuOpen(false)}>Signals</a>
          <a href="#pricing" className="nav-link" onClick={() => setMenuOpen(false)}>Pricing</a>
          <button onClick={() => navigate('/auth')} style={{ background: 'none', border: 'none', color: 'var(--text-2)', fontSize: 16, cursor: 'pointer', textAlign: 'left' }}>Sign in</button>
        </div>
      )}
    </nav>
  );
}

function Hero() {
  const navigate = useNavigate();
  return (
    <section style={{
      background: 'var(--bg)', minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', padding: '0 80px', gap: 60
    }} className="hero-grid">
      <div style={{ textAlign: 'left' }}>
        <div className="hero-eyebrow" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 10px', marginBottom: 28
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'pulse-dot 2.5s ease-in-out infinite' }} />
          <span className="mono" style={{ fontSize: 10, fontWeight: 600, color: 'var(--green)', letterSpacing: '0.1em' }}>LIVE &middot; SEC EDGAR MONITOR</span>
        </div>

        <h1 className="hero-headline" style={{
          fontSize: 'clamp(42px, 5vw, 68px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.04em', color: 'var(--text-1)', marginBottom: 20, maxWidth: 560
        }}>
          Market moves
          start in a filing.
          We read it first.
        </h1>

        <p className="hero-sub" style={{
          fontSize: 16, fontWeight: 400, color: 'var(--text-2)', lineHeight: 1.75, maxWidth: 440, marginBottom: 36
        }}>
          AFI detects every SEC filing the moment it hits EDGAR — 
          8-K, 10-K, Form 4, SC 13D — classifies market impact with AI, 
          and maps the chain reaction to competitors and suppliers. 
          In under 2 minutes.
        </p>

        <div className="hero-ctas" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40 }}>
          <button className="btn-primary" onClick={() => navigate('/auth?mode=signup')}>Get early access</button>
          <button className="btn-secondary" onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            Watch it classify a filing <span className="arrow">→</span>
          </button>
        </div>

        <div className="hero-stats mono" style={{ display: 'flex', alignItems: 'center', fontSize: 11, color: '#2D3F55' }}>
          &lt; 2min detection &middot; 6 form types &middot; 8 enrichment agents &middot; live
        </div>
      </div>

      <Terminal />
    </section>
  );
}

function Terminal() {
  const linesContainerRef = useRef(null);
  const cardContainerRef = useRef(null);

  useEffect(() => {
    let active = true;

    const buildLogLines = (t) => [
      { time: '11:14:02', modColor: '#4A5568', module: 'EDGAR', msgColor: 'inherit', message: 'Polling SEC EDGAR \u2014 6 form types' },
      { time: '11:14:03', modColor: '#4A5568', module: 'EDGAR', msgColor: 'inherit', message: `Found: ${t.ticker} ${t.form} filed 11:14:01 ET` },
      { time: '11:14:04', modColor: '#3B82F6', module: 'EXTRACT', msgColor: 'inherit', message: 'TinyFish agent initialized' },
      { time: '11:14:06', modColor: '#3B82F6', module: 'EXTRACT', msgColor: 'inherit', message: 'Extracted 3,553 chars \u2713' },
      { time: '11:14:07', modColor: '#F59E0B', module: 'GEMINI', msgColor: 'inherit', message: 'Classifying with Gemini 2.0 Flash...' },
      { time: '11:14:09', modColor: '#22C55E', module: 'GEMINI', msgColor: 'inherit', message: `${t.signal} \u00B7 conf:${t.conf} \u00B7 ${t.event} \u2713` },
      { time: '11:14:09', modColor: '#8B5CF6', module: 'ENRICH', msgColor: 'inherit', message: '8 agents firing in parallel...' },
      { time: '11:14:11', modColor: '#8B5CF6', module: 'ENRICH', msgColor: 'inherit', message: 'News: bullish \u00B7 Insider: +$4.2M \u00B7 Social: +0.72' },
      { time: '11:14:11', modColor: '#22C55E', module: 'SIGNAL', msgColor: 'inherit', message: `Signal stored \u2192 impact:${t.impact}` },
      { time: '11:14:12', modColor: '#22C55E', module: 'ALERT', msgColor: 'inherit', message: 'Telegram dispatched \u2713' },
    ];

    async function runSequence() {
      if (!linesContainerRef.current || !cardContainerRef.current) return;
      let idx = 0;
      
      while (active) {
        if (!linesContainerRef.current || !cardContainerRef.current) return;
        const tickerData = TICKERS[idx];
        const lines = buildLogLines(tickerData);

        linesContainerRef.current.innerHTML = '';
        cardContainerRef.current.style.opacity = '0';
        cardContainerRef.current.style.transform = 'translateY(8px)';
        linesContainerRef.current.style.opacity = '1';

        for (const line of lines) {
          if (!active || !linesContainerRef.current) return;
          await sleep(360);
          if (!active || !linesContainerRef.current) return;

          const row = document.createElement('div');
          row.style.cssText = 'display:flex;gap:0;';

          const ts = document.createElement('span');
          ts.style.cssText = 'min-width:58px;color:#2D3F55;';
          ts.textContent = line.time;

          const mod = document.createElement('span');
          mod.style.cssText = `min-width:62px;color:${line.modColor};`;
          mod.textContent = line.module;

          const msg = document.createElement('span');
          msg.style.cssText = `color:${line.msgColor};`;

          row.append(ts, mod, msg);
          linesContainerRef.current.appendChild(row);

          await new Typewriter(msg, line.message, 9).start();
          if (!active || !linesContainerRef.current) return;
          linesContainerRef.current.scrollTop = linesContainerRef.current.scrollHeight;
        }

        if (!active || !linesContainerRef.current || !cardContainerRef.current) return;

        // Update Card
        cardContainerRef.current.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="display:flex;gap:8px;align-items:center;">
              <span style="font-family:var(--font-mono);font-size:14px;font-weight:800;color:#F0F6FF;">${tickerData.ticker}</span>
              <span style="background:#1D3557;color:#3B82F6;font-size:9px;font-family:var(--font-mono);padding:1px 5px;border-radius:3px;">${tickerData.form}</span>
              <span style="background:${tickerData.signal==='RISK'?'#2E0D0D':'#0D2E1A'};color:${tickerData.signal==='RISK'?'#EF4444':'#22C55E'};font-size:9px;font-family:var(--font-mono);padding:1px 5px;border-radius:3px;">${tickerData.signal}</span>
            </div>
            <span style="font-family:var(--font-mono);font-size:11px;color:${tickerData.signal==='RISK'?'#EF4444':'#22C55E'};font-weight:700;">${tickerData.conf}%  IMP:${tickerData.impact}</span>
          </div>
          <div style="font-family:var(--font-mono);font-size:10px;color:#3B82F6;font-weight:700;margin-top:6px;">${tickerData.event.replace('_', ' ')}</div>
          <div style="font-size:11px;color:#8B9EB0;margin-top:4px;line-height:1.5;">${tickerData.summary}</div>
          <div style="border-left:2px solid #1D3557;padding-left:8px;margin-top:8px;font-style:italic;font-size:11px;color:#4A5568;">${tickerData.why}</div>
          <div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap;">
            ${tickerData.chains.map(c => `
              <span style="background:${c.includes('↑')?'#0D2E1A':c.includes('↓')?'#2E0D0D':'#1C2333'};color:${c.includes('↑')?'#22C55E':c.includes('↓')?'#EF4444':'#4A5568'};font-size:9px;font-family:var(--font-mono);padding:2px 6px;border-radius:3px;">${c}</span>
            `).join('')}
          </div>
        `;

        await sleep(500);
        if (!active || !cardContainerRef.current) return;
        cardContainerRef.current.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        cardContainerRef.current.style.opacity = '1';
        cardContainerRef.current.style.transform = 'translateY(0)';

        await sleep(5000);
        if (!active || !linesContainerRef.current || !cardContainerRef.current) return;

        linesContainerRef.current.style.transition = 'opacity 0.4s ease';
        cardContainerRef.current.style.transition = 'opacity 0.4s ease';
        linesContainerRef.current.style.opacity = '0';
        cardContainerRef.current.style.opacity = '0';

        await sleep(400);
        if (!active) return;
        idx = (idx + 1) % TICKERS.length;
      }
    }
    
    runSequence();
    return () => { active = false; };
  }, []);

  return (
    <div className="terminal-wrapper" style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', width: '100%', maxWidth: 540,
      boxShadow: '0 0 0 1px rgba(255,255,255,0.03), 0 1px 0 0 rgba(255,255,255,0.05) inset, 0 24px 48px rgba(0,0,0,0.5), 0 8px 16px rgba(0,0,0,0.3)'
    }}>
      <div style={{ height: 38, background: '#0A0D14', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['#FF5F56', '#FFBD2E', '#27C93F'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
        </div>
        <div className="mono" style={{ fontSize: 10, fontWeight: 500, color: '#2D3F55', letterSpacing: '0.08em' }}>AFI &middot; EXECUTION MONITOR</div>
      </div>
      <div style={{ padding: '16px 18px', minHeight: 280, fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 2 }}>
        <div ref={linesContainerRef} style={{ display: 'flex', flexDirection: 'column' }} />
        <div ref={cardContainerRef} style={{
          marginTop: 12, background: '#0F1824', border: '1px solid #1D3557', borderLeft: '3px solid var(--green)', borderRadius: 6, padding: '12px 14px', opacity: 0
        }} />
      </div>
    </div>
  );
}

function TickerTape() {
  const items = [
    { t: 'NVDA', s: 'POSITIVE', e: 'Earnings Beat', c: '87%' },
    { t: 'TSLA', s: 'POSITIVE', e: 'Insider Buy', c: '74%' },
    { t: 'COIN', s: 'RISK', e: 'Activist Entry', c: '71%' },
    { t: 'AAPL', s: 'NEUTRAL', e: '10-Q Filed', c: '99%' },
    { t: 'PLTR', s: 'POSITIVE', e: 'Contract Win', c: '82%' },
    { t: 'META', s: 'RISK', e: 'Exec Departure', c: '65%' },
    { t: 'AMZN', s: 'POSITIVE', e: 'Guidance Raise', c: '88%' },
    { t: 'GOOG', s: 'NEUTRAL', e: '8-K Filed', c: '95%' },
    { t: 'MSFT', s: 'POSITIVE', e: 'Earnings Beat', c: '91%' },
    { t: 'AMD', s: 'RISK', e: 'Earnings Miss', c: '84%' },
    { t: 'INTC', s: 'RISK', e: 'Guidance Cut', c: '79%' },
    { t: 'NFLX', s: 'POSITIVE', e: 'Subscriber Beat', c: '86%' }
  ];

  const renderItem = (i, index) => (
    <div key={index} style={{ display: 'inline-flex', alignItems: 'center', gap: 16, paddingRight: 40, borderRight: '1px solid var(--border)' }}>
      <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{i.t}</span>
      <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: i.s === 'RISK' ? 'var(--red)' : i.s === 'POSITIVE' ? 'var(--green)' : 'var(--amber)' }}>{i.s}</span>
      <span className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>{i.e}</span>
      <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>{i.c}</span>
    </div>
  );

  return (
    <section style={{ background: '#0A0D14', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '16px 0', height: 72, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, overflow: 'hidden' }}>
      <div className="tape" style={{ display: 'flex', alignItems: 'center', height: 20 }}>
        <div className="tape-row tape-row-left" style={{ display: 'flex', gap: 40, paddingLeft: 40 }}>
          {[...items, ...items, ...items, ...items].map((item, idx) => renderItem(item, `row1-${idx}`))}
        </div>
      </div>
      <div className="tape" style={{ display: 'flex', alignItems: 'center', height: 20 }}>
        <div className="tape-row tape-row-right" style={{ display: 'flex', gap: 40, paddingLeft: 40 }}>
          {[...items, ...items, ...items, ...items].reverse().map((item, idx) => renderItem(item, `row2-${idx}`))}
        </div>
      </div>
    </section>
  );
}

function TheProblem() {
  return (
    <section style={{ background: 'var(--bg)', padding: '160px 80px', maxWidth: 720 }}>
      <div className="reveal" data-delay="0">
        <div className="mono" style={{ fontSize: 10, fontWeight: 600, color: '#2D3F55', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 24 }}>THE PROBLEM</div>
      </div>
      
      <div className="reveal" data-delay="0.12">
        <h2 style={{ fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text-1)', lineHeight: 1.1, marginBottom: 40 }}>
          By the time you read<br />the news, the trade<br />is already over.
        </h2>
      </div>

      <div className="reveal" data-delay="0.24">
        <p style={{ fontSize: 17, color: 'var(--text-2)', lineHeight: 1.85, maxWidth: 580, marginBottom: 20 }}>
          SEC filings are the original source of market-moving events. Earnings beats, executive departures, activist entries, insider purchases — they all land in EDGAR first. Before any headline. Before any analyst note.
        </p>
      </div>

      <div className="reveal" data-delay="0.36">
        <p style={{ fontSize: 17, color: 'var(--text-2)', lineHeight: 1.85, maxWidth: 580, marginBottom: 20 }}>
          Most platforms give you the story 20 minutes later. By then, the options have already moved. The pre-market gap has already been priced. The informed money has already acted.
        </p>
        <p style={{ fontSize: 17, color: 'var(--text-2)', lineHeight: 1.85, maxWidth: 580, marginBottom: 20 }}>
          AFI reads the filing the moment it appears. Classifies it with AI. Maps which competitors, suppliers, and sectors are affected. And delivers the signal before anyone publishes a word.
        </p>
      </div>

      <div className="reveal" data-delay="0.48">
        <div style={{ width: 48, height: 1, background: 'var(--border)', margin: '48px 0' }} />
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em', lineHeight: 1.4 }}>
          Speed is alpha. We give you speed.
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { num: '01', name: 'SEC EDGAR', desc: 'Polled every 45s.\nAll 6 form types.', tag: 'REAL-TIME' },
    { num: '02', name: 'Extraction', desc: 'TinyFish + 3 fallback\nmethods. Zero drops.', tag: 'RESILIENT' },
    { num: '03', name: 'AI classification', desc: 'Gemini 2.0 Flash.\nChain-of-thought reasoning.', tag: 'AI-POWERED' },
    { num: '04', name: '8 agents', desc: 'News, social, insider,\ncongress, divergence.', tag: 'PARALLEL' },
    { num: '05', name: 'Delivered', desc: 'Dashboard + Telegram\n+ push. < 2 minutes.', tag: 'MULTI-CHANNEL' }
  ];

  return (
    <section id="how" style={{ background: '#0A0D14', borderTop: '1px solid var(--border)', padding: '120px 80px' }}>
      <div className="mono reveal" style={{ fontSize: 10, fontWeight: 600, color: '#2D3F55', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 24 }}>HOW IT WORKS</div>
      <h2 className="reveal" style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text-1)', lineHeight: 1.1, marginBottom: 64 }}>
        From filing to signal<br />in 90 seconds.
      </h2>

      <div className="how-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', position: 'relative' }}>
        {steps.map((st, i) => (
          <div key={i} className="step-card reveal" data-delay={i * 0.08} style={{
            padding: '24px 20px', borderRight: i < steps.length - 1 ? '1px solid var(--border)' : 'none', position: 'relative'
          }}>
            <div className="mono" style={{ fontSize: 10, fontWeight: 600, color: '#2D3F55', letterSpacing: '0.1em', marginBottom: 14 }}>{st.num}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>{st.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.65, whiteSpace: 'pre-line' }}>{st.desc}</div>
            <div className="mono" style={{ fontSize: 9, fontWeight: 700, color: 'var(--blue)', marginTop: 16, display: 'block', letterSpacing: '0.08em' }}>{st.tag}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Capabilities() {
  const caps = [
    { name: '< 2-minute detection', desc: 'EDGAR is polled every 45 seconds during pre-market hours. Every 90 seconds during regular trading. The pipeline fires the moment a filing appears.', tag: 'REAL-TIME' },
    { name: 'Chain reaction engine', desc: 'Every signal maps to competitors, suppliers, and sector peers automatically. See who benefits and who takes the hit before the market connects the dots.', tag: 'DETERMINISTIC' },
    { name: 'Divergence detection', desc: 'Compares what the CEO says in press releases against what the SEC filing actually discloses. Ranked by contradiction score. SAID vs FILED.', tag: 'AI + RULES' },
    { name: '8 parallel enrichment agents', desc: 'News sentiment, Reddit and StockTwits, insider transactions, congressional trading, divergence signals, genome patterns — all fire simultaneously via asyncio.gather.', tag: 'CONCURRENT' },
    { name: 'Genome alerts', desc: 'Tracks each company\'s historical filing patterns. Flags statistical anomalies — late filings, amendment ratios, unusual disclosure gaps that precede material events.', tag: 'PATTERN MATCHING' },
    { name: 'Price correlation', desc: 'Every signal is tracked against price action at T+1h, T+24h, and T+3d. Confidence scores calibrate automatically from real outcomes.', tag: 'FEEDBACK LOOP' },
  ];

  return (
    <section id="features" style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)', padding: '120px 80px' }}>
      <div className="mono reveal" style={{ fontSize: 10, fontWeight: 600, color: '#2D3F55', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 24 }}>CAPABILITIES</div>
      <h2 className="reveal" style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text-1)', lineHeight: 1.1, marginBottom: 16 }}>
        Every edge the public<br />market offers.
      </h2>
      <p className="reveal" style={{ fontSize: 17, color: 'var(--text-2)', marginBottom: 64 }}>Built for traders who treat information latency as alpha.</p>

      <div className="cap-grid reveal" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: '1px solid var(--border)' }}>
        {caps.map((c, i) => (
          <div key={i} style={{ padding: '36px 32px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--bg)', transition: 'background 200ms' }}
               onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-raised)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--bg)'}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em', marginBottom: 12 }}>{c.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.75, maxWidth: 280 }}>{c.desc}</div>
            <div className="mono" style={{ fontSize: 9, fontWeight: 700, color: 'var(--blue)', marginTop: 20, display: 'block', letterSpacing: '0.08em' }}>{c.tag}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LiveSignals() {
  const cards = [
    { ticker: 'TSLA', form: '8-K', sig: 'POSITIVE', conf: 90, imp: 84, ev: 'EARNINGS BEAT', sum: 'Tesla Q4 and FY 2025 results \u2014 strong free cash flow and strategic $2B xAI investment despite revenue dips.', why: 'Free cash flow strength \u2192 reduces debt risk \u2192 offsets weak delivery numbers', chains: [{d:'↑',t:'RIVN'},{d:'↓',t:'GM'},{d:'↑',t:'LCID'},{d:'→',t:'PANASONIC'}], time: '8 days ago \u00B7 #a4b2c3d1' },
    { ticker: 'BLNE', form: '8-K', sig: 'POSITIVE', conf: 95, imp: 72, ev: 'CONTRACT WIN', sum: 'Beeline Holdings \u2014 strategic partnership with TYTL Corp for blockchain-based fractional real estate equity platform.', why: 'New revenue stream \u2192 reduces concentration risk \u2192 signals institutional interest', chains: [{d:'→',t:'RE sector'},{d:'↑',t:'MSTR'}], time: '12 days ago \u00B7 #b5c3d4e2' },
    { ticker: 'LBSR', form: '8-K', sig: 'RISK', conf: 85, imp: 68, ev: 'CONTRACT WIN (contested)', sum: 'Liberty Star Uranium & Metals \u2014 contract at $110,000. Activist concerns flagged by Starboard re governance.', why: 'Governance dispute \u2192 management distraction \u2192 execution risk on new contracts', chains: [{d:'↓',t:'peers'},{d:'→',t:'sector'}], time: '14 days ago \u00B7 #c6d4e5f3' },
  ];

  return (
    <section id="demo" style={{ background: '#0A0D14', borderTop: '1px solid var(--border)', padding: '120px 80px' }}>
      <div className="hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60 }}>
        <div style={{ maxWidth: 380 }}>
          <div className="mono reveal" style={{ fontSize: 10, fontWeight: 600, color: '#2D3F55', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 24 }}>LIVE SIGNALS</div>
          <h2 className="reveal" style={{ fontSize: 'clamp(24px, 3vw, 38px)', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text-1)', lineHeight: 1.1, marginBottom: 20 }}>
            This is what lands<br />in your feed.
          </h2>
          <p className="reveal" style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.75 }}>
            Every card is a classified SEC filing. Real event type, real confidence score, real chain reaction mapped to suppliers and competitors.
          </p>
          <div className="reveal" style={{ marginTop: 32 }}>
            {[
              { c: 'var(--green)', t: 'Green cards = earnings beats, insider buys, guidance raises' },
              { c: 'var(--red)', t: 'Red cards = activist entries, misses, exec departures' },
              { c: 'var(--purple)', t: 'Purple particles = supply chain ripple effects' }
            ].map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.c }} />
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{p.t}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cards.map((c, i) => (
            <div key={i} className="reveal" data-delay={i * 0.08} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: `3px solid ${c.sig === 'RISK' ? 'var(--red)' : 'var(--green)'}`,
              borderRadius: 8, padding: '14px 16px', cursor: 'pointer', transition: 'border-color 200ms, background 200ms'
            }} onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-hi)'; e.currentTarget.style.background = '#0F1520'; }}
               onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-card)'; }}>
               
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="mono" style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>{c.ticker}</span>
                  <span className="mono" style={{ background: 'var(--border)', color: 'var(--text-2)', fontSize: 9, padding: '2px 6px', borderRadius: 3 }}>{c.form}</span>
                  <span className="mono" style={{ background: c.sig === 'RISK' ? '#2E0D0D' : '#0D2E1A', color: c.sig === 'RISK' ? 'var(--red)' : 'var(--green)', fontSize: 9, padding: '2px 6px', borderRadius: 3 }}>{c.sig}</span>
                </div>
                <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: c.sig === 'RISK' ? 'var(--red)' : 'var(--green)' }}>{c.conf}%  IMP:{c.imp}</span>
              </div>
              <div className="mono" style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', marginTop: 8 }}>{c.ev}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.55 }}>{c.sum}</div>
              <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: 8, marginTop: 8, fontStyle: 'italic', fontSize: 11, color: 'var(--text-3)' }}>{c.why}</div>
              <div style={{ display: 'flex', gap: 4, marginTop: 10, flexWrap: 'wrap' }}>
                {c.chains.map((ch, idx) => (
                  <span key={idx} className="mono" style={{
                    background: ch.d === '↑' ? '#0D2E1A' : ch.d === '↓' ? '#2E0D0D' : 'var(--border)',
                    color: ch.d === '↑' ? 'var(--green)' : ch.d === '↓' ? 'var(--red)' : 'var(--text-3)',
                    fontSize: 9, padding: '2px 6px', borderRadius: 3
                  }}>{ch.d} {ch.t}</span>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', alignItems: 'center' }}>
                <span className="mono" style={{ fontSize: 9, color: '#2D3F55' }}>{c.time}</span>
                <button className="mono" style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-3)', fontSize: 10, padding: '3px 8px', borderRadius: 3, cursor: 'pointer', transition: 'all 150ms' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.color = 'var(--blue)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-3)'; }}>WATCH</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Metrics() {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); observer.disconnect(); }
    }, { threshold: 0.5 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    const animateCount = (id, target) => {
      const el = document.getElementById(id);
      if (!el) return;
      const start = performance.now();
      const update = now => {
        const p = Math.min((now - start) / 900, 1);
        const ease = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(ease * target);
        if (p < 1) requestAnimationFrame(update);
      };
      requestAnimationFrame(update);
    };
    animateCount('met-6', 6);
    animateCount('met-8', 8);
  }, [inView]);

  return (
    <section ref={ref} style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)', padding: '100px 80px' }}>
      <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: '1px solid var(--border)' }}>
        {[
          { v: '< 2min', l: 'from filing to signal' },
          { id: 'met-6', v: '0', l: 'form types monitored' },
          { id: 'met-8', v: '0', l: 'parallel enrichment agents' },
          { v: '100%', l: 'pipeline uptime goal' }
        ].map((m, i) => (
          <div key={i} style={{ padding: '48px 40px', borderRight: i < 3 ? '1px solid var(--border)' : 'none' }}>
            <div id={m.id} className="mono" style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 800, color: 'var(--text-1)', lineHeight: 1, letterSpacing: '-0.03em' }}>{m.v}</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 10, lineHeight: 1.5 }}>{m.l}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: '48px 80px', fontSize: 15, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.7, maxWidth: 560, margin: '0 auto' }}>
        Built for active traders, quant researchers, and fund analysts who treat information latency as a structural disadvantage — not a fact of life.
      </div>
    </section>
  );
}

function FinalCta() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <section style={{ background: '#0A0D14', borderTop: '1px solid var(--border)', padding: '160px 80px', textAlign: 'center' }}>
      <h2 style={{ fontSize: 'clamp(36px, 5vw, 60px)', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text-1)', lineHeight: 1.1, marginBottom: 16 }}>
        Stop reading the news.<br />Start reading the filing.
      </h2>
      <p style={{ fontSize: 16, color: 'var(--text-2)', maxWidth: 380, margin: '16px auto 40px' }}>
        Join the waitlist. We'll give you access when your slot is ready.
      </p>

      {!submitted ? (
        <form className="cta-email-row" onSubmit={e => { e.preventDefault(); setSubmitted(true); }} style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <input className="cta-input" type="email" placeholder="name@company.com" required style={{
            width: 280, height: 44, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-1)', fontSize: 14, padding: '0 14px', outline: 'none', transition: 'border-color 150ms'
          }} onFocus={e => e.target.style.borderColor = 'var(--blue)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
          <button className="cta-btn" type="submit" style={{
            height: 44, padding: '0 22px', background: 'var(--text-1)', color: 'var(--bg)', fontSize: 14, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer', transition: 'transform 100ms, background 150ms'
          }} onMouseEnter={e => e.target.style.background = '#FFF'} onMouseLeave={e => e.target.style.background = 'var(--text-1)'} onMouseDown={e => e.target.style.transform = 'scale(0.97)'} onMouseUp={e => e.target.style.transform = 'scale(1)'}>
            Request access
          </button>
        </form>
      ) : (
        <div style={{ animation: 'fadeUp 0.4s ease forwards' }}>
          <div className="mono" style={{ fontSize: 13, color: 'var(--green)' }}>You're on the list.</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>We'll reach out with your access details.</div>
        </div>
      )}

      <div className="mono" style={{ fontSize: 10, color: '#2D3F55', marginTop: 20 }}>No credit card. No sales call. Just early access.</div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)', padding: '28px 80px' }}>
      <div className="footer-flex" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>AFI</div>
        <div className="mono" style={{ display: 'flex', gap: 24, fontSize: 11 }}>
          {['Privacy', 'Terms', 'Status', 'GitHub'].map(l => (
            <span key={l} style={{ color: '#2D3F55', cursor: 'pointer', transition: 'color 150ms' }}
                  onMouseEnter={e => e.target.style.color = 'var(--text-3)'} onMouseLeave={e => e.target.style.color = '#2D3F55'}>{l}</span>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'pulse-dot 2.5s ease-in-out infinite' }} />
          <div className="mono" style={{ fontSize: 10, color: '#2D3F55' }}>EDGAR monitor active</div>
        </div>
      </div>
      <div className="mono" style={{ marginTop: 16, textAlign: 'center', fontSize: 10, color: 'var(--border)' }}>
        © 2026 AFI Platform · Not financial advice · Built for informational purposes only.
      </div>
    </footer>
  );
}
