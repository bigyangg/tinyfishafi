import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

// ─── LANDING PAGE ────────────────────────────────────────────
export default function Landing() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Staggered reveal
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#040404",
      color: "#fff",
      fontFamily: "'JetBrains Mono', monospace",
      overflow: "hidden",
      position: "relative",
    }}>

      {/* ── DOT GRID BACKGROUND ── */}
      <div style={{
        position: "fixed",
        inset: 0,
        backgroundImage: `radial-gradient(circle, #ffffff05 1px, transparent 1px)`,
        backgroundSize: "32px 32px",
        pointerEvents: "none",
        zIndex: 0,
      }} />

      {/* ── GRADIENT OVERLAY ── */}
      <div style={{
        position: "fixed",
        inset: 0,
        background: "radial-gradient(ellipse 80% 60% at 50% -10%, #0066FF0a, transparent)",
        pointerEvents: "none",
        zIndex: 0,
      }} />

      {/* ── NAVBAR ── */}
      <nav style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "56px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 40px",
        background: "rgba(4,4,4,0.8)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid #ffffff08",
        zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "0.12em", color: "#fff" }}>
            AFI
          </span>
          <span style={{ fontSize: "9px", color: "#333", letterSpacing: "0.14em" }}>
            MARKET INTELLIGENCE
          </span>
        </div>

        {/* Live status pill */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "7px",
          padding: "5px 12px",
          background: "#00C80508",
          border: "1px solid #00C80520",
          borderRadius: "20px",
        }}>
          <div style={{
            width: "5px", height: "5px", borderRadius: "50%",
            background: "#00C805",
            animation: "livePulse 2s ease-in-out infinite",
          }} />
          <span style={{ fontSize: "9px", color: "#00C80599", letterSpacing: "0.1em" }}>
            MONITORING EDGAR — LIVE
          </span>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            onClick={() => navigate("/auth")}
            style={{
              background: "transparent",
              border: "none",
              color: "#555",
              fontSize: "11px",
              letterSpacing: "0.08em",
              cursor: "pointer",
              padding: "6px 14px",
              transition: "color 150ms",
            }}
            onMouseEnter={e => e.currentTarget.style.color = "#fff"}
            onMouseLeave={e => e.currentTarget.style.color = "#555"}
          >
            LOG IN
          </button>
          <button
            onClick={() => navigate("/auth?mode=signup")}
            style={{
              background: "#fff",
              border: "none",
              color: "#000",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              cursor: "pointer",
              padding: "7px 18px",
              transition: "opacity 150ms",
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
          >
            GET STARTED →
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <div style={{
        position: "relative",
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "160px 24px 80px",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transition: "opacity 600ms ease, transform 600ms ease",
      }}>

        {/* Eyebrow tag */}
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "5px 14px",
          background: "#0066FF0d",
          border: "1px solid #0066FF25",
          borderRadius: "20px",
          marginBottom: "32px",
        }}>
          <span style={{ fontSize: "9px", color: "#0066FF", letterSpacing: "0.14em" }}>
            AUTONOMOUS SEC EDGAR MONITORING
          </span>
        </div>

        {/* Headline */}
        <h1 style={{
          margin: "0 0 20px",
          fontSize: "clamp(42px, 7vw, 80px)",
          fontWeight: 800,
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
          fontFamily: "'JetBrains Mono', monospace",
          maxWidth: "880px",
        }}>
          <span style={{ color: "#fff" }}>Know Before</span>
          <br />
          <span style={{
            background: "linear-gradient(135deg, #ffffff 0%, #555 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            The Market Does.
          </span>
        </h1>

        {/* Subheadline */}
        <p style={{
          margin: "0 0 48px",
          fontSize: "15px",
          color: "#555",
          lineHeight: 1.7,
          maxWidth: "560px",
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 400,
        }}>
          AFI detects SEC 8-K filings within 2 minutes of publication,
          classifies market impact with AI, and sends signals to your
          dashboard and Telegram — before the news cycle reacts.
        </p>

        {/* CTA buttons */}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
          <button
            onClick={() => navigate("/auth?mode=signup")}
            style={{
              padding: "14px 32px",
              background: "#fff",
              border: "none",
              color: "#000",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
              transition: "opacity 150ms",
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
          >
            START MONITORING FREE
          </button>
          <button
            onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
            style={{
              padding: "14px 32px",
              background: "transparent",
              border: "1px solid #1e1e1e",
              color: "#555",
              fontSize: "12px",
              letterSpacing: "0.08em",
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
              transition: "border-color 150ms, color 150ms",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.color = "#aaa"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#1e1e1e"; e.currentTarget.style.color = "#555"; }}
          >
            SEE HOW IT WORKS
          </button>
        </div>
      </div>

      {/* ── LIVE SIGNAL TICKER (scrolling) ── */}
      <div style={{
        position: "relative",
        zIndex: 1,
        borderTop: "1px solid #0f0f0f",
        borderBottom: "1px solid #0f0f0f",
        background: "#040404",
        overflow: "hidden",
        padding: "12px 0",
        marginBottom: "80px",
      }}>
        <div style={{
          display: "flex",
          gap: "48px",
          animation: "ticker 20s linear infinite",
          whiteSpace: "nowrap",
          width: "max-content",
        }}>
          {/* Duplicate for seamless loop */}
          {[...SAMPLE_SIGNALS, ...SAMPLE_SIGNALS].map((s, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#fff", letterSpacing: "0.08em" }}>
                {s.ticker}
              </span>
              <span style={{
                fontSize: "9px",
                padding: "2px 6px",
                background: s.signal === "Positive" ? "#00C80518" : s.signal === "Risk" ? "#FF333318" : "#ffffff08",
                border: `1px solid ${s.signal === "Positive" ? "#00C80540" : s.signal === "Risk" ? "#FF333340" : "#ffffff10"}`,
                color: s.signal === "Positive" ? "#00C805" : s.signal === "Risk" ? "#FF3333" : "#555",
                letterSpacing: "0.06em",
              }}>
                {s.signal.toUpperCase()}
              </span>
              <span style={{ fontSize: "10px", color: "#2a2a2a" }}>
                {s.event}
              </span>
              <span style={{ fontSize: "10px", color: "#1a1a1a", letterSpacing: "0.06em" }}>
                {s.impact}/100
              </span>
              <span style={{ color: "#111", fontSize: "10px" }}>·</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── STATS ROW ── */}
      <div style={{
        position: "relative",
        zIndex: 1,
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "1px",
        background: "#0f0f0f",
        maxWidth: "900px",
        margin: "0 auto 60px",
        opacity: visible ? 1 : 0,
        transition: "opacity 800ms 200ms ease",
      }}>
        {[
          { value: "<2min", label: "DETECTION SPEED" },
          { value: "5 Forms", label: "SEC FILING COVERAGE" },
          { value: "0-100", label: "IMPACT SCORE" },
          { value: "24/7", label: "MARKET MONITORING" },
        ].map(({ value, label }) => (
          <div key={label} style={{
            background: "#080808",
            padding: "28px 24px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: "26px", fontWeight: 700, color: "#fff", letterSpacing: "-0.01em", marginBottom: "6px" }}>
              {value}
            </div>
            <div style={{ fontSize: "9px", color: "#2a2a2a", letterSpacing: "0.14em" }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* ── REFINED HOW IT WORKS / INTELLIGENCE PIPELINE ── */}
      <div
        id="how-it-works"
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: "1000px",
          margin: "0 auto 120px",
          padding: "0 24px",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "50px" }}>
          <h2 style={{
            fontSize: "clamp(24px, 4vw, 36px)",
            fontWeight: 800,
            color: "#fff",
            letterSpacing: "-0.02em",
            fontFamily: "'JetBrains Mono', monospace",
            margin: "0 0 16px 0",
          }}>
            The Intelligence Pipeline
          </h2>
          <p style={{
            color: "#666",
            fontSize: "14px",
            maxWidth: "500px",
            margin: "0 auto",
            lineHeight: 1.6,
          }}>
            Proprietary infrastructure designed for professional market
            participants who require an information edge.
          </p>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "24px",
        }}>
          {[
            { phase: "01", title: "DETECT", desc: "Direct connection to global regulatory feeds including SEC EDGAR." },
            { phase: "02", title: "ANALYZE", desc: "Large Language Models extract material changes from complex legal and financial text." },
            { phase: "03", title: "GOVERNANCE", desc: "5-stage validation framework prevents hallucinations and ensures factual accuracy." },
            { phase: "04", title: "SCORE", desc: "Quantitative correlation against historical data to assign impact confidence." },
            { phase: "05", title: "ALERT", desc: "Instant delivery via Webhook, Telegram, or our native Professional Terminal." },
          ].map((s, i) => (
            <div key={i} style={{
              background: "#080808",
              border: "1px solid #1a1a1a",
              padding: "24px",
              borderRadius: "4px",
              transition: "border-color 200ms, background-color 200ms",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#333"; e.currentTarget.style.backgroundColor = "#0d0d0d"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#1a1a1a"; e.currentTarget.style.backgroundColor = "#080808"; }}
            >
              <div style={{
                fontSize: "10px",
                fontWeight: 700,
                color: "#555",
                marginBottom: "20px",
                letterSpacing: "0.2em",
              }}>
                PHASE {s.phase}
              </div>
              <h3 style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "#fff",
                margin: "0 0 12px 0",
                letterSpacing: "0.05em",
              }}>
                {s.title}
              </h3>
              <p style={{
                fontSize: "12px",
                color: "#666",
                lineHeight: 1.6,
                margin: 0,
              }}>
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── SIGNAL EXAMPLE CARD ── */}
      <div style={{
        position: "relative",
        zIndex: 1,
        maxWidth: "600px",
        margin: "0 auto 100px",
        padding: "0 24px",
      }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "9px", color: "#333", letterSpacing: "0.18em" }}>EXAMPLE SIGNAL</div>
        </div>
        <div style={{
          background: "#080808",
          border: "1px solid #111",
          borderLeft: "2px solid #00C805",
          padding: "20px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <span style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.08em" }}>TSLA</span>
              <span style={{ fontSize: "9px", padding: "2px 6px", background: "#00C80518", border: "1px solid #00C80540", color: "#00C805", letterSpacing: "0.06em" }}>
                POSITIVE
              </span>
              <span style={{ fontSize: "9px", color: "#0066FF", letterSpacing: "0.04em" }}>EARNINGS BEAT</span>
            </div>
            <span style={{ fontSize: "10px", color: "#222" }}>2 min ago</span>
          </div>
          <p style={{ fontSize: "12px", color: "#666", lineHeight: 1.6, margin: "0 0 12px" }}>
            Tesla reports Q4 and FY 2025 financial results, showing strong free cash flow and a strategic $2B xAI investment despite revenue dips.
          </p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: "16px" }}>
              <span style={{ fontSize: "9px", color: "#333" }}>CONFIDENCE: 90%</span>
              <span style={{ fontSize: "9px", color: "#333" }}>IMPACT: 84/100</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "40px", height: "1px", background: "#111" }}>
                <div style={{ height: "100%", width: "84%", background: "#FF3333" }} />
              </div>
              <span style={{ fontSize: "9px", color: "#FF3333" }}>84</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── FINAL CTA ── */}
      <div style={{
        position: "relative",
        zIndex: 1,
        textAlign: "center",
        padding: "60px 24px 100px",
        borderTop: "1px solid #0d0d0d",
      }}>
        <h2 style={{ fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 700, margin: "0 0 16px", letterSpacing: "-0.01em" }}>
          Stop Checking.<br />
          <span style={{ color: "#555" }}>Start Knowing.</span>
        </h2>
        <p style={{ fontSize: "12px", color: "#333", margin: "0 0 36px", letterSpacing: "0.04em" }}>
          Free to start. No credit card required.
        </p>
        <button
          onClick={() => navigate("/auth?mode=signup")}
          style={{
            padding: "14px 40px",
            background: "#fff",
            border: "none",
            color: "#000",
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            cursor: "pointer",
            transition: "opacity 150ms",
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}
        >
          START MONITORING FREE →
        </button>
      </div>

      {/* ── FOOTER ── */}
      <footer style={{
        position: "relative",
        zIndex: 1,
        borderTop: "1px solid #0a0a0a",
        padding: "20px 40px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", color: "#2a2a2a" }}>AFI</span>
        <span style={{ fontSize: "10px", color: "#1a1a1a" }}>Market Event Intelligence</span>
      </footer>

      {/* ── CSS ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&display=swap');

        @keyframes livePulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 #00C80540; }
          50%       { opacity: 0.7; box-shadow: 0 0 0 5px #00C80508; }
        }

        @keyframes ticker {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>

    </div >
  );
}

// ── SAMPLE SIGNALS FOR TICKER ──
const SAMPLE_SIGNALS = [
  { ticker: "TSLA", signal: "Positive", event: "EARNINGS BEAT", impact: 84 },
  { ticker: "NVDA", signal: "Neutral", event: "EXEC DEPARTURE", impact: 67 },
  { ticker: "AAPL", signal: "Neutral", event: "ADMIN 8-K", impact: 62 },
  { ticker: "BLNE", signal: "Positive", event: "CONTRACT WIN", impact: 72 },
  { ticker: "LBSR", signal: "Risk", event: "DEBT FINANCING", impact: 68 },
  { ticker: "CRSP", signal: "Neutral", event: "ADMIN 8-K", impact: 38 },
  { ticker: "FLUT", signal: "Positive", event: "MATERIAL EVENT", impact: 55 },
  { ticker: "NERV", signal: "Neutral", event: "ADMIN 8-K", impact: 52 },
];
