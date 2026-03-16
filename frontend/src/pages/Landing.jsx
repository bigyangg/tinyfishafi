// Landing.jsx — AFI v3.0 Premium Landing Page
// Scroll-driven parallax, live real-time signals, billion-dollar aesthetic
import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API = process.env.REACT_APP_BACKEND_URL;
const HERO_IMG = "https://static.prod-images.emergentagent.com/jobs/84501a4e-f10a-4908-b24d-f6b54bab7e4b/images/fa3fd774b9d9980b15ebe50aa2adbc4dce13f6923aced51e6a95c2eb1f37631d.png";
const PIPELINE_IMG = "https://static.prod-images.emergentagent.com/jobs/84501a4e-f10a-4908-b24d-f6b54bab7e4b/images/d7f15fdda45448773a350d4ccdfcad415d665eabc64c882f5f9a15f362f5a2f8.png";

// Live signal feed from real API
function useLiveSignals() {
  const [signals, setSignals] = useState([]);
  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await axios.get(`${API}/api/signals?limit=12`);
        setSignals(res.data.signals || []);
      } catch { /* fallback */ }
    };
    fetch();
    const interval = setInterval(fetch, 30000);
    return () => clearInterval(interval);
  }, []);
  return signals;
}

// Scroll-driven reveal hook
function useScrollReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

// Parallax scroll value hook
function useParallax() {
  const [y, setY] = useState(0);
  useEffect(() => {
    const handler = () => setY(window.scrollY);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);
  return y;
}

function timeAgo(d) {
  if (!d) return "";
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function Landing() {
  const navigate = useNavigate();
  const scrollY = useParallax();
  const liveSignals = useLiveSignals();
  const [heroVis, setHeroVis] = useState(false);

  const [ref1, vis1] = useScrollReveal(0.1);
  const [ref2, vis2] = useScrollReveal(0.1);
  const [ref3, vis3] = useScrollReveal(0.1);
  const [ref4, vis4] = useScrollReveal(0.15);
  const [ref5, vis5] = useScrollReveal(0.1);
  const [refCta, visCta] = useScrollReveal(0.2);

  useEffect(() => { const t = setTimeout(() => setHeroVis(true), 80); return () => clearTimeout(t); }, []);

  // Live count animation
  const [liveCount, setLiveCount] = useState(0);
  useEffect(() => {
    if (liveSignals.length > 0 && liveCount === 0) {
      let c = 0;
      const target = liveSignals.length;
      const inc = Math.max(1, Math.floor(target / 30));
      const timer = setInterval(() => {
        c += inc;
        if (c >= target) { c = target; clearInterval(timer); }
        setLiveCount(c);
      }, 40);
      return () => clearInterval(timer);
    }
  }, [liveSignals.length, liveCount]);

  const tickerSignals = liveSignals.length > 0 ? liveSignals : FALLBACK_SIGNALS;

  return (
    <div style={{ minHeight: "100vh", background: "#030303", color: "#fff", fontFamily: "'Inter', 'JetBrains Mono', sans-serif", overflow: "hidden", position: "relative" }}>

      {/* GRID TEXTURE */}
      <div style={{ position: "fixed", inset: 0, backgroundImage: "radial-gradient(circle, #ffffff03 1px, transparent 1px)", backgroundSize: "40px 40px", pointerEvents: "none", zIndex: 0 }} />

      {/* ── NAVBAR ── */}
      <nav data-testid="landing-navbar" style={{
        position: "fixed", top: 0, left: 0, right: 0, height: "52px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 32px", background: "rgba(3,3,3,0.85)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid #0a0a0a", zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "17px", fontWeight: 800, letterSpacing: "0.15em", color: "#fff", fontFamily: "'JetBrains Mono', monospace" }}>AFI</span>
          <span style={{ fontSize: "8px", color: "#222", letterSpacing: "0.2em", fontWeight: 500 }}>AUTONOMOUS INTELLIGENCE</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 10px", background: "#00C80506", border: "1px solid #00C80515" }}>
          <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#00C805", animation: "livePulse 2s ease-in-out infinite" }} />
          <span style={{ fontSize: "8px", color: "#00C80580", letterSpacing: "0.12em", fontWeight: 600 }}>EDGAR LIVE</span>
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <button onClick={() => navigate("/auth")} data-testid="nav-login"
            style={{ background: "transparent", border: "1px solid #111", color: "#444", fontSize: "10px", letterSpacing: "0.1em", cursor: "pointer", padding: "6px 14px", fontWeight: 600, transition: "all 150ms" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#333"; e.currentTarget.style.color = "#aaa"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#111"; e.currentTarget.style.color = "#444"; }}>
            LOG IN
          </button>
          <button onClick={() => navigate("/auth?mode=signup")} data-testid="nav-signup"
            style={{ background: "#0066FF", border: "none", color: "#fff", fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", padding: "7px 18px", transition: "opacity 150ms" }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
            ACCESS TERMINAL
          </button>
        </div>
      </nav>

      {/* ══════════════════════════ HERO ══════════════════════════ */}
      <section style={{
        position: "relative", zIndex: 1, minHeight: "100vh",
        display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
        padding: "140px 24px 60px", textAlign: "center",
      }}>
        {/* Parallax hero image fading behind */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 0,
          backgroundImage: `url(${HERO_IMG})`, backgroundSize: "cover", backgroundPosition: "center",
          opacity: 0.06, transform: `translateY(${scrollY * 0.2}px)`, transition: "transform 0s",
        }} />

        {/* Radial glow */}
        <div style={{ position: "absolute", top: "30%", left: "50%", transform: "translate(-50%,-50%)", width: "900px", height: "500px", background: "radial-gradient(ellipse, #0066FF06, transparent 70%)", pointerEvents: "none" }} />

        <div style={{
          position: "relative", zIndex: 2, maxWidth: "900px",
          opacity: heroVis ? 1 : 0, transform: heroVis ? "translateY(0)" : "translateY(30px)",
          transition: "opacity 800ms ease, transform 800ms ease",
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "10px",
            padding: "6px 16px", background: "#0066FF08", border: "1px solid #0066FF15",
            marginBottom: "40px",
          }}>
            <div style={{ width: "3px", height: "3px", borderRadius: "50%", background: "#0066FF" }} />
            <span style={{ fontSize: "8px", color: "#0066FF", letterSpacing: "0.18em", fontWeight: 600 }}>7 AUTONOMOUS AGENTS — REAL-TIME SEC MONITORING</span>
          </div>

          <h1 style={{
            margin: "0 0 28px", fontSize: "clamp(48px, 8vw, 88px)", fontWeight: 800, lineHeight: 0.95,
            letterSpacing: "-0.04em", fontFamily: "'JetBrains Mono', monospace",
          }}>
            <span style={{ color: "#fff" }}>We Catch</span>
            <br />
            <span style={{ color: "#fff" }}>Companies</span>
            <br />
            <span style={{ background: "linear-gradient(135deg, #0066FF 0%, #00C805 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Lying.
            </span>
          </h1>

          <p style={{
            margin: "0 auto 48px", fontSize: "14px", color: "#444", lineHeight: 1.8,
            maxWidth: "520px", fontFamily: "'JetBrains Mono', monospace",
          }}>
            AFI deploys 7 AI agents across SEC filings, news, social media, insider trades, and congressional disclosures — simultaneously. When management says one thing publicly and files another legally, we detect it.
          </p>

          <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => navigate("/auth?mode=signup")} data-testid="hero-cta"
              style={{
                padding: "15px 36px", background: "#0066FF", border: "none", color: "#fff",
                fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer",
                fontFamily: "'JetBrains Mono', monospace", transition: "all 200ms",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#0052CC"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#0066FF"; e.currentTarget.style.transform = "translateY(0)"; }}>
              ACCESS THE TERMINAL
            </button>
            <button onClick={() => document.getElementById("pipeline")?.scrollIntoView({ behavior: "smooth" })}
              style={{
                padding: "15px 36px", background: "transparent", border: "1px solid #1a1a1a", color: "#444",
                fontSize: "11px", letterSpacing: "0.08em", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", transition: "all 200ms",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#333"; e.currentTarget.style.color = "#888"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#1a1a1a"; e.currentTarget.style.color = "#444"; }}>
              SEE THE PIPELINE
            </button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════ LIVE SIGNAL RIBBON ══════════════════════════ */}
      <section ref={ref1} style={{
        position: "relative", zIndex: 2,
        borderTop: "1px solid #0a0a0a", borderBottom: "1px solid #0a0a0a",
        background: "#020202", overflow: "hidden",
        opacity: vis1 ? 1 : 0, transition: "opacity 600ms ease",
      }}>
        <div style={{ padding: "8px 32px", display: "flex", alignItems: "center", gap: "12px", borderBottom: "1px solid #080808" }}>
          <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#0066FF", animation: "livePulse 2s ease-in-out infinite" }} />
          <span style={{ fontSize: "8px", color: "#333", letterSpacing: "0.16em", fontWeight: 600 }}>LIVE SIGNAL FEED — {liveCount} SIGNALS PROCESSED</span>
        </div>
        <div style={{ padding: "10px 0", overflow: "hidden" }}>
          <div style={{
            display: "flex", gap: "32px", animation: "ticker 25s linear infinite",
            whiteSpace: "nowrap", width: "max-content",
          }}>
            {[...tickerSignals, ...tickerSignals].map((s, i) => {
              const sig = s.classification || s.signal || "Neutral";
              const sigColor = sig === "Positive" ? "#00C805" : sig === "Risk" ? "#FF3333" : "#333";
              return (
                <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center", padding: "0 4px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#fff", letterSpacing: "0.08em", fontFamily: "'JetBrains Mono', monospace" }}>
                    {s.ticker}
                  </span>
                  <span style={{ fontSize: "8px", padding: "2px 6px", background: `${sigColor}12`, border: `1px solid ${sigColor}30`, color: sigColor, letterSpacing: "0.08em", fontWeight: 700 }}>
                    {sig.toUpperCase()}
                  </span>
                  <span style={{ fontSize: "9px", color: "#1a1a1a", fontFamily: "'JetBrains Mono', monospace" }}>
                    {s.confidence || s.impact || 0}%
                  </span>
                  {s.filed_at && <span style={{ fontSize: "8px", color: "#111" }}>{timeAgo(s.filed_at)}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════════════════════ STATS ══════════════════════════ */}
      <section ref={ref2} style={{
        position: "relative", zIndex: 1, maxWidth: "1000px", margin: "0 auto",
        padding: "80px 24px 0",
        opacity: vis2 ? 1 : 0, transform: vis2 ? "translateY(0)" : "translateY(40px)",
        transition: "all 700ms ease 200ms",
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1px", background: "#0a0a0a" }}>
          {[
            { value: "<2min", label: "DETECTION", sub: "Filing to signal" },
            { value: "7", label: "AGENTS", sub: "Running in parallel" },
            { value: "15s", label: "ENRICHMENT", sub: "Full intelligence cycle" },
            { value: "24/7", label: "MONITORING", sub: "Autonomous operation" },
          ].map(({ value, label, sub }, i) => (
            <div key={label} style={{
              background: "#050505", padding: "36px 20px", textAlign: "center",
              opacity: vis2 ? 1 : 0, transform: vis2 ? "translateY(0)" : "translateY(20px)",
              transition: `all 600ms ease ${150 + i * 100}ms`,
            }}>
              <div style={{ fontSize: "32px", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", marginBottom: "6px", fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
              <div style={{ fontSize: "9px", color: "#0066FF", letterSpacing: "0.14em", fontWeight: 600, marginBottom: "4px" }}>{label}</div>
              <div style={{ fontSize: "9px", color: "#222" }}>{sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════ PIPELINE (fixed alignment) ══════════════════════════ */}
      <section id="pipeline" ref={ref3} style={{
        position: "relative", zIndex: 1, maxWidth: "1100px", margin: "0 auto",
        padding: "120px 24px 0",
        opacity: vis3 ? 1 : 0, transform: vis3 ? "translateY(0)" : "translateY(50px)",
        transition: "all 800ms ease",
      }}>
        {/* Parallax pipeline image */}
        <div style={{
          position: "absolute", top: "-60px", left: "50%", transform: `translate(-50%, ${Math.max(0, (scrollY - 600) * 0.08)}px)`,
          width: "100%", height: "300px", backgroundImage: `url(${PIPELINE_IMG})`, backgroundSize: "cover", backgroundPosition: "center",
          opacity: 0.04, pointerEvents: "none",
        }} />

        <div style={{ textAlign: "center", marginBottom: "60px", position: "relative", zIndex: 2 }}>
          <div style={{ fontSize: "8px", color: "#333", letterSpacing: "0.2em", fontWeight: 600, marginBottom: "12px" }}>HOW AFI WORKS</div>
          <h2 style={{ margin: "0 0 16px", fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 800, letterSpacing: "-0.03em", fontFamily: "'JetBrains Mono', monospace" }}>
            The Intelligence Pipeline
          </h2>
          <p style={{ color: "#333", fontSize: "13px", maxWidth: "480px", margin: "0 auto", lineHeight: 1.7 }}>
            Five stages. Zero hallucination tolerance. Every signal validated before it reaches you.
          </p>
        </div>

        {/* PIPELINE CARDS — 5 columns, perfectly aligned */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "2px",
          background: "#0a0a0a", position: "relative", zIndex: 2,
        }}>
          {[
            { phase: "01", title: "DETECT", icon: "//", desc: "Direct EDGAR RSS feed. Every 8-K, 10-K, 10-Q, Form 4, SC 13D. Sub-2-minute latency.", color: "#0066FF" },
            { phase: "02", title: "EXTRACT", icon: "[]", desc: "TinyFish navigates filing index. Backend downloads document. Full text in 200ms.", color: "#00C805" },
            { phase: "03", title: "CLASSIFY", icon: "{}", desc: "Gemini 2.5 Flash chain-of-thought reasoning. Signal, confidence, impact — structured JSON.", color: "#F59E0B" },
            { phase: "04", title: "ENRICH", icon: ">>", desc: "7 agents fire: news, social, insider, congress, divergence, genome — all in parallel, 15s.", color: "#A855F7" },
            { phase: "05", title: "ALERT", icon: "!!", desc: "Telegram HTML, Resend email, browser push, real-time dashboard. Instant multi-channel.", color: "#FF3333" },
          ].map((s, i) => (
            <div key={i} style={{
              background: "#050505", padding: "28px 18px", position: "relative",
              opacity: vis3 ? 1 : 0, transform: vis3 ? "translateY(0)" : "translateY(30px)",
              transition: `all 500ms ease ${200 + i * 120}ms`,
              borderTop: `2px solid ${s.color}20`,
            }}
              onMouseEnter={e => { e.currentTarget.style.background = "#080808"; e.currentTarget.style.borderTopColor = `${s.color}60`; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#050505"; e.currentTarget.style.borderTopColor = `${s.color}20`; }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <span style={{ fontSize: "8px", color: "#333", letterSpacing: "0.18em", fontWeight: 600 }}>PHASE {s.phase}</span>
                <span style={{ fontSize: "11px", color: s.color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, opacity: 0.5 }}>{s.icon}</span>
              </div>
              <h3 style={{ fontSize: "14px", fontWeight: 800, color: "#fff", margin: "0 0 10px", letterSpacing: "0.06em", fontFamily: "'JetBrains Mono', monospace" }}>
                {s.title}
              </h3>
              <p style={{ fontSize: "11px", color: "#444", lineHeight: 1.6, margin: 0 }}>
                {s.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Flow line connecting phases */}
        <div style={{ display: "flex", justifyContent: "center", padding: "20px 0 0", position: "relative", zIndex: 2 }}>
          <div style={{ width: "80%", height: "1px", background: "linear-gradient(90deg, transparent, #0066FF30, #00C80530, #F59E0B30, #A855F730, #FF333330, transparent)" }} />
        </div>
      </section>

      {/* ══════════════════════════ LIVE SIGNAL SHOWCASE ══════════════════════════ */}
      <section ref={ref4} style={{
        position: "relative", zIndex: 1, maxWidth: "1100px", margin: "0 auto",
        padding: "120px 24px 0",
        opacity: vis4 ? 1 : 0, transform: vis4 ? "translateY(0)" : "translateY(50px)",
        transition: "all 800ms ease",
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "60px", alignItems: "flex-start" }}>
          {/* Left: explanation */}
          <div>
            <div style={{ fontSize: "8px", color: "#333", letterSpacing: "0.2em", fontWeight: 600, marginBottom: "12px" }}>DIVERGENCE DETECTION</div>
            <h2 style={{ margin: "0 0 20px", fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 800, letterSpacing: "-0.03em", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.15 }}>
              When CEOs lie,<br /><span style={{ color: "#FF3333" }}>we know.</span>
            </h2>
            <p style={{ fontSize: "13px", color: "#444", lineHeight: 1.8, margin: "0 0 32px" }}>
              Our Divergence Detection engine compares what management says publicly with what they file legally. When a press release says "record growth" but the 8-K reveals declining revenue — we flag it instantly.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {[
                { label: "Divergence Score", val: "0–100 severity rating" },
                { label: "Contradiction Alert", val: "Exact quotes vs filing reality" },
                { label: "Genome Pattern Match", val: "Historical crisis fingerprinting" },
              ].map(({ label, val }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "3px", height: "24px", background: "#0066FF20" }} />
                  <div>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.04em" }}>{label}</div>
                    <div style={{ fontSize: "10px", color: "#333" }}>{val}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Live signal cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ fontSize: "8px", color: "#333", letterSpacing: "0.16em", fontWeight: 600, marginBottom: "8px" }}>
              LIVE SIGNALS — REAL-TIME
            </div>
            {(liveSignals.length > 0 ? liveSignals.slice(0, 4) : FALLBACK_SIGNALS.slice(0, 4)).map((s, i) => {
              const sig = s.classification || s.signal || "Neutral";
              const sigColor = sig === "Positive" ? "#00C805" : sig === "Risk" ? "#FF3333" : "#1a1a1a";
              const conf = s.confidence || 0;
              const barColor = conf > 80 ? "#00C805" : conf >= 50 ? "#F59E0B" : "#FF3333";
              return (
                <div key={i} style={{
                  background: "#050505", border: "1px solid #0a0a0a", borderLeft: `3px solid ${sigColor}`,
                  padding: "14px 16px", position: "relative", overflow: "hidden",
                  opacity: vis4 ? 1 : 0, transform: vis4 ? "translateX(0)" : "translateX(30px)",
                  transition: `all 500ms ease ${300 + i * 150}ms`,
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#080808"; e.currentTarget.style.borderLeftColor = "#0066FF"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "#050505"; e.currentTarget.style.borderLeftColor = sigColor; }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#ccc", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em" }}>{s.ticker}</span>
                    <span style={{ fontSize: "8px", padding: "1px 5px", background: `${sigColor}12`, border: `1px solid ${sigColor}30`, color: sigColor, fontWeight: 700, letterSpacing: "0.06em" }}>{sig.toUpperCase()}</span>
                    <span style={{ fontSize: "8px", color: "#0066FF80", letterSpacing: "0.04em" }}>{s.filing_type || "8-K"}</span>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: "11px", fontWeight: 700, color: `${barColor}`, fontFamily: "'JetBrains Mono', monospace" }}>{conf > 0 ? `${conf}%` : "--"}</span>
                  </div>
                  <p style={{ fontSize: "10px", color: "#444", lineHeight: 1.5, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.summary || "Signal analysis in progress..."}
                  </p>
                  {conf > 0 && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "2px", background: "#0a0a0a" }}><div style={{ height: "100%", width: `${conf}%`, background: barColor }} /></div>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════════════════════ AGENT GRID ══════════════════════════ */}
      <section ref={ref5} style={{
        position: "relative", zIndex: 1, maxWidth: "1100px", margin: "0 auto",
        padding: "120px 24px 0",
        opacity: vis5 ? 1 : 0, transform: vis5 ? "translateY(0)" : "translateY(50px)",
        transition: "all 800ms ease",
      }}>
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <div style={{ fontSize: "8px", color: "#333", letterSpacing: "0.2em", fontWeight: 600, marginBottom: "12px" }}>AUTONOMOUS INTELLIGENCE NETWORK</div>
          <h2 style={{ margin: 0, fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 800, letterSpacing: "-0.03em", fontFamily: "'JetBrains Mono', monospace" }}>
            7 Agents. One Signal.
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "2px", background: "#0a0a0a" }}>
          {[
            { name: "EDGAR", desc: "Filing index navigation. Finds primary document URL.", accent: "#0066FF" },
            { name: "NEWS", desc: "Yahoo Finance. Top 8 headlines, sentiment score.", accent: "#00C805" },
            { name: "SOCIAL", desc: "Reddit + StockTwits. Retail vs smart money delta.", accent: "#F59E0B" },
            { name: "INSIDER", desc: "Form 4 transactions. Filing delay detection.", accent: "#A855F7" },
            { name: "CONGRESS", desc: "House + Senate trades. Suspicious timing.", accent: "#FF3333" },
            { name: "DIVERGENCE", desc: "IR page press release vs legal filing.", accent: "#FF6B00" },
            { name: "GENOME", desc: "40-filing behavioral fingerprint. Crisis patterns.", accent: "#0066FF" },
          ].map((a, i) => (
            <div key={a.name} style={{
              background: "#050505", padding: "24px 18px",
              opacity: vis5 ? 1 : 0, transform: vis5 ? "scale(1)" : "scale(0.95)",
              transition: `all 400ms ease ${100 + i * 80}ms`,
              borderLeft: `2px solid ${a.accent}15`,
            }}
              onMouseEnter={e => { e.currentTarget.style.borderLeftColor = `${a.accent}60`; e.currentTarget.style.background = "#080808"; }}
              onMouseLeave={e => { e.currentTarget.style.borderLeftColor = `${a.accent}15`; e.currentTarget.style.background = "#050505"; }}>
              <div style={{ fontSize: "12px", fontWeight: 800, color: a.accent, letterSpacing: "0.08em", fontFamily: "'JetBrains Mono', monospace", marginBottom: "8px" }}>
                {a.name}
              </div>
              <p style={{ fontSize: "10px", color: "#444", lineHeight: 1.6, margin: 0 }}>{a.desc}</p>
            </div>
          ))}
          {/* Fill remaining cell to complete grid */}
          <div style={{ background: "#050505", padding: "24px 18px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: "24px", fontWeight: 800, color: "#0a0a0a", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em" }}>AFI</span>
          </div>
        </div>
      </section>

      {/* ══════════════════════════ FINAL CTA ══════════════════════════ */}
      <section ref={refCta} style={{
        position: "relative", zIndex: 1, textAlign: "center",
        padding: "140px 24px 80px",
        opacity: visCta ? 1 : 0, transform: visCta ? "translateY(0)" : "translateY(40px)",
        transition: "all 800ms ease",
      }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "600px", height: "300px", background: "radial-gradient(ellipse, #0066FF08, transparent 70%)", pointerEvents: "none" }} />
        <h2 style={{ margin: "0 0 16px", fontSize: "clamp(32px, 5vw, 56px)", fontWeight: 800, letterSpacing: "-0.04em", fontFamily: "'JetBrains Mono', monospace", position: "relative" }}>
          Stop Guessing.
          <br />
          <span style={{ background: "linear-gradient(135deg, #0066FF 0%, #00C805 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Start Knowing.
          </span>
        </h2>
        <p style={{ fontSize: "12px", color: "#222", margin: "0 0 40px", letterSpacing: "0.06em" }}>
          Free access. No credit card. Real signals.
        </p>
        <button onClick={() => navigate("/auth?mode=signup")} data-testid="cta-final"
          style={{
            padding: "16px 44px", background: "#0066FF", border: "none", color: "#fff",
            fontSize: "12px", fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer",
            fontFamily: "'JetBrains Mono', monospace", transition: "all 200ms", position: "relative",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#0052CC"; e.currentTarget.style.transform = "translateY(-2px)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#0066FF"; e.currentTarget.style.transform = "translateY(0)"; }}>
          ACCESS THE TERMINAL
        </button>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ position: "relative", zIndex: 1, borderTop: "1px solid #080808", padding: "20px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.12em", color: "#1a1a1a", fontFamily: "'JetBrains Mono', monospace" }}>AFI</span>
        <span style={{ fontSize: "9px", color: "#111", letterSpacing: "0.08em" }}>Autonomous Filing Intelligence — Powered by TinyFish</span>
      </footer>

      {/* ── CSS ANIMATIONS ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap');
        @keyframes livePulse { 0%,100%{opacity:1;box-shadow:0 0 0 0 #00C80540} 50%{opacity:0.6;box-shadow:0 0 0 6px #00C80508} }
        @keyframes ticker { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        * { box-sizing: border-box; }
        ::selection { background: #0066FF30; color: #fff; }
        body { margin: 0; }
      `}</style>
    </div>
  );
}

const FALLBACK_SIGNALS = [
  { ticker: "TSLA", signal: "Positive", filing_type: "8-K", confidence: 90, summary: "Tesla reports Q4 results with strong free cash flow, strategic $2B xAI investment." },
  { ticker: "NVDA", signal: "Neutral", filing_type: "8-K", confidence: 67, summary: "NVIDIA files administrative 8-K regarding executive compensation adjustments." },
  { ticker: "BA", signal: "Risk", filing_type: "8-K", confidence: 82, summary: "Boeing reports production slowdowns and potential delivery timeline delays." },
  { ticker: "AAPL", signal: "Positive", filing_type: "10-K", confidence: 88, summary: "Apple annual report shows record Services revenue growth exceeding analyst estimates." },
  { ticker: "META", signal: "Neutral", filing_type: "8-K", confidence: 55, summary: "Meta Platforms files routine officer appointment and board updates." },
  { ticker: "AMZN", signal: "Positive", filing_type: "10-Q", confidence: 78, summary: "Amazon Web Services quarterly growth accelerating, operating margins expanding." },
];
