#!/usr/bin/env python3
"""
seed_demo.py — Pre-seed Supabase with 15 high-quality demo signals
Run from backend/: python scripts/seed_demo.py

These signals are designed to showcase every AFI feature:
- Divergence detection (NVDA, TSLA)  
- Genome alerts (AAPL, META)
- Supply chain ripples (NVDA → TSM → ASML)
- Insider activity (JPM)
- Event cascades (semiconductor cluster)
"""

import os
import sys
import uuid
import json
from datetime import datetime, timedelta, timezone

# Add parent to path for supabase import
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from supabase import create_client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Time anchors
now = datetime.now(timezone.utc)

DEMO_SIGNALS = [
    # --- SEMICONDUCTOR CLUSTER (shows event cascade + ripple) ---
    {
        "ticker": "NVDA",
        "company": "NVIDIA Corporation",
        "filing_type": "8-K",
        "accession_number": f"demo_{uuid.uuid4().hex[:12]}",
        "signal": "Positive",
        "classification": "Positive",
        "confidence": 92,
        "impact_score": 88,
        "event_type": "EARNINGS_BEAT",
        "summary": "NVIDIA reports record Q4 revenue of $22.1B, beating estimates by 18%. Data center revenue surged 409% YoY driven by AI chip demand. Guidance raised for Q1 2025.",
        "key_facts": json.dumps(["Revenue: $22.1B (est. $20.4B)", "Data Center: $18.4B (+409% YoY)", "Gaming: $2.9B (+56%)", "Q1 guidance: $24B ± 2%"]),
        "filed_at": (now - timedelta(hours=2)).isoformat(),
        "divergence_score": 45,
        "divergence_severity": "LOW",
        "genome_score": 85,
        "genome_trend": "IMPROVING",
        "genome_alert": True,
        "genome_pattern_matches": json.dumps([{"pattern": "REVENUE_ACCELERATION", "count": 4, "similarity": 92}]),
    },
    {
        "ticker": "AMD",
        "company": "Advanced Micro Devices",
        "filing_type": "8-K",
        "accession_number": f"demo_{uuid.uuid4().hex[:12]}",
        "signal": "Positive",
        "classification": "Positive",
        "confidence": 78,
        "impact_score": 72,
        "event_type": "EARNINGS_BEAT",
        "summary": "AMD Q4 results show data center GPU revenue up 120% QoQ. MI300X ramp exceeding expectations. Management confirms $3.5B AI chip revenue target for 2024.",
        "key_facts": json.dumps(["Revenue: $6.2B (+10% YoY)", "Data Center GPU: +120% QoQ", "MI300X ramp ahead of schedule", "2024 AI target: $3.5B"]),
        "filed_at": (now - timedelta(hours=3)).isoformat(),
        "genome_score": 72,
        "genome_trend": "IMPROVING",
    },
    {
        "ticker": "TSM",
        "company": "Taiwan Semiconductor",
        "filing_type": "8-K",
        "accession_number": f"demo_{uuid.uuid4().hex[:12]}",
        "signal": "Positive",
        "classification": "Positive",
        "confidence": 85,
        "impact_score": 76,
        "event_type": "EARNINGS_BEAT",
        "summary": "TSMC reports record monthly revenue, driven by N3/N5 AI accelerator demand. Capex guidance raised to $32B for advanced node expansion.",
        "key_facts": json.dumps(["Monthly revenue: $7.1B (record)", "N3/N5 utilization: 95%+", "Capex: $32B (raised from $28B)", "AI accelerator demand 'unprecedented'"]),
        "filed_at": (now - timedelta(hours=3, minutes=30)).isoformat(),
    },

    # --- HIGH DIVERGENCE (shows SAID vs FILED contradiction) ---
    {
        "ticker": "TSLA",
        "company": "Tesla Inc",
        "filing_type": "10-Q",
        "accession_number": f"demo_{uuid.uuid4().hex[:12]}",
        "signal": "Risk",
        "classification": "Risk",
        "confidence": 87,
        "impact_score": 82,
        "event_type": "EARNINGS_MISS",
        "summary": "Tesla Q4 10-Q reveals automotive gross margin declined to 17.6%, lowest since 2019. Filing contradicts Elon Musk's claims of 'sustainable profitability improvement'.",
        "key_facts": json.dumps(["Auto gross margin: 17.6% (Q3: 18.7%)", "Inventory days: 28 → 42", "Deferred revenue down 15%", "Warranty provisions up $340M"]),
        "filed_at": (now - timedelta(hours=5)).isoformat(),
        "divergence_score": 89,
        "divergence_severity": "CRITICAL",
        "public_claim": "We expect continued margin expansion and sustainable profitability improvement in 2025",
        "filing_reality": "Gross margin declined 110bps QoQ to 17.6%. Warranty provisions increased $340M. Inventory buildup suggests weakening demand.",
        "contradiction_summary": "CEO claimed margin expansion while filing shows 110bp margin decline, rising inventory, and increased warranty costs.",
    },
    {
        "ticker": "META",
        "company": "Meta Platforms Inc",
        "filing_type": "10-K",
        "accession_number": f"demo_{uuid.uuid4().hex[:12]}",
        "signal": "Risk",
        "classification": "Risk",
        "confidence": 74,
        "impact_score": 68,
        "event_type": "LEGAL_REGULATORY",
        "summary": "Meta's annual filing reveals $18.3B Reality Labs loss, EU Digital Markets Act compliance costs, and ongoing FTC antitrust investigation. New risk factor: AI content moderation liability.",
        "key_facts": json.dumps(["Reality Labs loss: $18.3B", "EU DMA compliance: $2.1B estimated", "FTC investigation ongoing", "New risk: AI content liability"]),
        "filed_at": (now - timedelta(hours=8)).isoformat(),
        "divergence_score": 72,
        "divergence_severity": "HIGH",
        "genome_alert": True,
        "genome_score": 58,
        "genome_trend": "DETERIORATING",
        "genome_pattern_matches": json.dumps([{"pattern": "REGULATORY_ESCALATION", "count": 3, "similarity": 88}]),
    },

    # --- INSIDER TRADING + CONGRESS ---
    {
        "ticker": "JPM",
        "company": "JPMorgan Chase & Co",
        "filing_type": "4",
        "accession_number": f"demo_{uuid.uuid4().hex[:12]}",
        "signal": "Risk",
        "classification": "Risk",
        "confidence": 81,
        "impact_score": 65,
        "event_type": "INSIDER_SELL",
        "summary": "JPM CEO Jamie Dimon sold $150M in shares — his first sale in 18 years as CEO. Filed within 48 hours of positive earnings guidance. Congress members traded within same window.",
        "key_facts": json.dumps(["CEO sold $150M in shares", "First sale in 18 years", "Filed 48h after positive guidance", "3 Congress members traded"]),
        "filed_at": (now - timedelta(hours=12)).isoformat(),
        "insider_net_30d": -150000000,
        "insider_net_90d": -150000000,
        "insider_ceo_activity": "SELLING",
        "insider_unusual_delay": True,
        "congress_net_sentiment": "SELLING",
        "congress_suspicious_timing": True,
        "congress_timing_note": "3 members sold within 72h of insider sale, before public disclosure",
        "congress_trades": json.dumps([
            {"member": "Nancy Pelosi", "party": "D", "type": "SELL", "amount": "$1M-$5M"},
            {"member": "Dan Crenshaw", "party": "R", "type": "SELL", "amount": "$500K-$1M"},
            {"member": "Tommy Tuberville", "party": "R", "type": "SELL", "amount": "$250K-$500K"},
        ]),
    },

    # --- ACTIVIST FILING ---
    {
        "ticker": "DIS",
        "company": "The Walt Disney Company",
        "filing_type": "SC 13D",
        "accession_number": f"demo_{uuid.uuid4().hex[:12]}",
        "signal": "Positive",
        "classification": "Positive",
        "confidence": 83,
        "impact_score": 78,
        "event_type": "ACTIVIST_FILING",
        "summary": "Trian Fund Management increases Disney stake to 9.2%, pushing for board seats and streaming profitability acceleration. Filing demands cost cuts and park investment review.",
        "key_facts": json.dumps(["Trian stake: 9.2% (+2.1%)", "Demanding 3 board seats", "Calls for $3B cost reduction", "Wants streaming profit by Q4 2025"]),
        "filed_at": (now - timedelta(hours=6)).isoformat(),
    },

    # --- IPO REGISTRATION ---
    {
        "ticker": "RDDT",
        "company": "Reddit Inc",
        "filing_type": "S-1",
        "accession_number": f"demo_{uuid.uuid4().hex[:12]}",
        "signal": "Positive",
        "classification": "Positive",
        "confidence": 76,
        "impact_score": 71,
        "event_type": "IPO_REGISTRATION",
        "summary": "Reddit S-1 reveals $804M annual revenue (+20% YoY), 73M DAUs, and AI data licensing as emerging revenue stream. Seeking $6.5B valuation.",
        "key_facts": json.dumps(["Revenue: $804M (+20% YoY)", "DAUs: 73M", "AI data licensing: $203M", "Target valuation: $6.5B"]),
        "filed_at": (now - timedelta(hours=16)).isoformat(),
        "reddit_sentiment": 0.72,
        "stocktwits_sentiment": 0.65,
        "social_volume_spike": True,
        "social_vs_filing_delta": "ALIGNED_BULLISH",
        "news_headlines": json.dumps([
            {"headline": "Reddit IPO filing reveals AI data licensing as growth engine", "source": "Reuters"},
            {"headline": "Reddit targets $6.5B valuation in NYSE listing", "source": "Bloomberg"},
        ]),
    },

    # --- SOCIAL SENTIMENT CONFLICT ---
    {
        "ticker": "COIN",
        "company": "Coinbase Global Inc",
        "filing_type": "8-K",
        "accession_number": f"demo_{uuid.uuid4().hex[:12]}",
        "signal": "Risk",
        "classification": "Risk",
        "confidence": 69,
        "impact_score": 63,
        "event_type": "LEGAL_REGULATORY",
        "summary": "Coinbase 8-K discloses SEC Wells Notice response and $1.2B legal reserve increase. Social media sentiment remains bullish despite regulatory overhang.",
        "key_facts": json.dumps(["Wells Notice response filed", "Legal reserves: +$1.2B", "Crypto market cap +15% MTD", "Social sentiment conflicting with filing risk"]),
        "filed_at": (now - timedelta(hours=10)).isoformat(),
        "reddit_sentiment": 0.85,
        "stocktwits_sentiment": 0.78,
        "social_volume_spike": True,
        "social_vs_filing_delta": "CONFLICTING",
        "news_headlines": json.dumps([
            {"headline": "Coinbase responds to SEC Wells Notice, maintains listing strategy", "source": "CoinDesk"},
        ]),
    },

    # --- ENERGY SECTOR ---
    {
        "ticker": "XOM",
        "company": "Exxon Mobil Corporation",
        "filing_type": "10-K",
        "accession_number": f"demo_{uuid.uuid4().hex[:12]}",
        "signal": "Positive",
        "classification": "Positive",
        "confidence": 80,
        "impact_score": 69,
        "event_type": "EARNINGS_BEAT",
        "summary": "Exxon annual report shows record $36B net income. Pioneer Natural Resources acquisition on track. Permian Basin production exceeding targets by 12%.",
        "key_facts": json.dumps(["Net income: $36B (record)", "Pioneer acquisition: on track", "Permian production: +12% above target", "Dividend increased 4%"]),
        "filed_at": (now - timedelta(hours=18)).isoformat(),
    },

    # --- FINTECH ---
    {
        "ticker": "SQ",
        "company": "Block Inc",
        "filing_type": "8-K",
        "accession_number": f"demo_{uuid.uuid4().hex[:12]}",
        "signal": "Positive",
        "classification": "Positive",
        "confidence": 77,
        "impact_score": 66,
        "event_type": "LEADERSHIP_CHANGE",
        "summary": "Block announces new CFO from Stripe, signaling strategic pivot toward enterprise payments. Cash App gross profit grows 23% to $3.5B annual run rate.",
        "key_facts": json.dumps(["New CFO from Stripe appointed", "Cash App GPV: $3.5B ARR (+23%)", "Enterprise focus confirmed", "Bitcoin revenue down 15%"]),
        "filed_at": (now - timedelta(hours=14)).isoformat(),
    },

    # --- CLOUD ---
    {
        "ticker": "SNOW",
        "company": "Snowflake Inc",
        "filing_type": "8-K",
        "accession_number": f"demo_{uuid.uuid4().hex[:12]}",
        "signal": "Risk",
        "classification": "Risk",
        "confidence": 73,
        "impact_score": 71,
        "event_type": "EXEC_DEPARTURE",
        "summary": "Snowflake CEO Frank Slootman resigns unexpectedly. Board appoints former Google Cloud exec as interim CEO. Product revenue growth decelerating to 32% YoY.",
        "key_facts": json.dumps(["CEO resigned effective immediately", "Interim CEO: ex-Google Cloud", "Revenue growth: 32% (prev 60%)", "Net retention rate: 127% (prev 142%)"]),
        "filed_at": (now - timedelta(hours=20)).isoformat(),
        "divergence_score": 65,
        "divergence_severity": "HIGH",
    },

    # --- PHARMA ---
    {
        "ticker": "LLY",
        "company": "Eli Lilly and Company",
        "filing_type": "8-K",
        "accession_number": f"demo_{uuid.uuid4().hex[:12]}",
        "signal": "Positive",
        "classification": "Positive",
        "confidence": 91,
        "impact_score": 85,
        "event_type": "EARNINGS_BEAT",
        "summary": "Eli Lilly reports Mounjaro/Zepbound combined revenue of $5.4B in Q4, crushing estimates. Full-year 2025 guidance raised to $58-61B. GLP-1 market expanding faster than expected.",
        "key_facts": json.dumps(["Mounjaro + Zepbound: $5.4B Q4", "FY2025 guidance: $58-61B", "GLP-1 market TAM revised up 40%", "Supply constraints easing"]),
        "filed_at": (now - timedelta(hours=1)).isoformat(),
        "genome_alert": True,
        "genome_score": 94,
        "genome_trend": "IMPROVING",
        "genome_pattern_matches": json.dumps([{"pattern": "REVENUE_EXPLOSION", "count": 3, "similarity": 96}]),
    },

    # --- DEFENSE ---
    {
        "ticker": "RTX",
        "company": "RTX Corporation",
        "filing_type": "8-K",
        "accession_number": f"demo_{uuid.uuid4().hex[:12]}",
        "signal": "Risk",
        "classification": "Risk",
        "confidence": 72,
        "impact_score": 67,
        "event_type": "LEGAL_REGULATORY",
        "summary": "RTX discloses $3.5B charge for Pratt & Whitney engine recall. DOJ investigation into export control violations ongoing. Backlog remains record at $190B.",
        "key_facts": json.dumps(["Engine recall charge: $3.5B", "DOJ investigation: ongoing", "Backlog: $190B (record)", "Affected engines: 3,000+"]),
        "filed_at": (now - timedelta(hours=22)).isoformat(),
    },

    # --- BANKING ---
    {
        "ticker": "GS",
        "company": "Goldman Sachs Group Inc",
        "filing_type": "8-K",
        "accession_number": f"demo_{uuid.uuid4().hex[:12]}",
        "signal": "Positive",
        "classification": "Positive",
        "confidence": 82,
        "impact_score": 73,
        "event_type": "EARNINGS_BEAT",
        "summary": "Goldman Sachs Q4 investment banking revenue surges 51%. Trading revenue beats by 12%. Asset management AUM crosses $3T milestone. Corporate strategy pivot validated.",
        "key_facts": json.dumps(["IB revenue: +51% YoY", "Trading: +12% beat", "AUM: $3T (milestone)", "Marcus consumer exit completed"]),
        "filed_at": (now - timedelta(hours=24)).isoformat(),
    },
]


def seed():
    """Insert demo signals, skipping any that already exist."""
    inserted = 0
    skipped = 0

    for sig in DEMO_SIGNALS:
        try:
            # Check if accession already exists (prevent duplicates on re-run)
            existing = supabase.table("signals").select("id").eq("accession_number", sig["accession_number"]).execute()
            if existing.data:
                skipped += 1
                continue

            sig["id"] = str(uuid.uuid4())
            sig["created_at"] = datetime.now(timezone.utc).isoformat()
            sig["source"] = "demo_seed"
            sig["governance_status"] = "approved"

            supabase.table("signals").insert(sig).execute()
            inserted += 1
            print(f"  ✅ {sig['ticker']} — {sig['event_type']} ({sig['signal']})")

        except Exception as e:
            print(f"  ❌ {sig['ticker']}: {e}")
            skipped += 1

    print(f"\nDone: {inserted} inserted, {skipped} skipped")
    return inserted


if __name__ == "__main__":
    print("🐟 AFI Demo Seed — Inserting demo signals...\n")
    seed()
