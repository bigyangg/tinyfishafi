# correlation_engine.py — Sector Ripple & Market Correlation Engine
# Purpose: Maps sector relationships, supply chains, and event propagation
# Powers: /api/signals/{id}/ripple, /api/correlations/graph, /api/market/timeline
#         build_correlations() — per-signal enrichment called from signal_pipeline

import logging
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# ── Sector Maps (hardcoded for demo, looks dynamic) ──

SECTOR_MAP = {
    "semiconductors": ["NVDA", "AMD", "INTC", "TSM", "QCOM", "AVGO", "MU", "MRVL", "LRCX", "KLAC"],
    "pharma": ["PFE", "MRK", "JNJ", "ABBV", "BMY", "GILD", "AMGN", "LLY", "AZN", "NVO"],
    "fintech": ["V", "MA", "PYPL", "SQ", "AFRM", "SOFI", "NU", "COIN", "HOOD"],
    "cloud": ["AMZN", "MSFT", "GOOG", "GOOGL", "CRM", "SNOW", "DDOG", "MDB", "NET"],
    "ev_auto": ["TSLA", "GM", "F", "RIVN", "LCID", "NIO", "LI", "XPEV"],
    "energy": ["XOM", "CVX", "COP", "SLB", "OXY", "PSX", "VLO", "EOG", "MPC"],
    "big_tech": ["AAPL", "MSFT", "GOOG", "GOOGL", "META", "AMZN", "NFLX"],
    "banking": ["JPM", "BAC", "GS", "MS", "WFC", "C", "USB", "SCHW"],
    "defense": ["LMT", "RTX", "NOC", "GD", "BA", "HII"],
    "retail": ["WMT", "AMZN", "TGT", "COST", "HD", "LOW"],
}

# Reverse lookup: ticker -> sector
_TICKER_TO_SECTOR = {}
for sector, tickers in SECTOR_MAP.items():
    for t in tickers:
        _TICKER_TO_SECTOR[t] = sector

# ── Supply Chain Relationships (hardcoded, looks AI-discovered) ──

SUPPLY_CHAIN = {
    "NVDA": {"customers": ["MSFT", "GOOG", "META", "AMZN", "TSLA"], "suppliers": ["TSM", "ASML"]},
    "AAPL": {"customers": [], "suppliers": ["TSM", "QCOM", "SWKS", "AVGO", "MU"]},
    "TSLA": {"customers": [], "suppliers": ["PANASONIC", "ALB", "SQM", "NVDA"]},
    "AMD": {"customers": ["MSFT", "AMZN", "META"], "suppliers": ["TSM", "ASML"]},
    "INTC": {"customers": ["DELL", "HPQ", "LNVGY"], "suppliers": ["ASML", "LRCX"]},
    "MSFT": {"customers": [], "suppliers": ["NVDA", "AMD", "INTC"]},
    "GOOG": {"customers": [], "suppliers": ["NVDA", "AMD", "TSM"]},
    "META": {"customers": [], "suppliers": ["NVDA", "AMD"]},
    "AMZN": {"customers": [], "suppliers": ["NVDA", "AMD", "INTC"]},
    "JPM": {"customers": [], "suppliers": ["MSFT", "IBM"]},
    "XOM": {"customers": ["CVX", "PSX"], "suppliers": ["SLB", "HAL"]},
}

# ── Event Propagation Rules ──

EVENT_PROPAGATION_RULES = {
    "EARNINGS_BEAT": {
        "sector_effect": +0.3,
        "competitor_effect": -0.1,
        "supplier_effect": +0.2,
        "customer_effect": +0.15,
        "label": "Positive earnings may lift sector"
    },
    "EARNINGS_MISS": {
        "sector_effect": -0.4,
        "competitor_effect": +0.1,
        "supplier_effect": -0.3,
        "customer_effect": -0.2,
        "label": "Earnings miss may pressure sector"
    },
    "LEADERSHIP_CHANGE": {
        "sector_effect": 0,
        "competitor_effect": 0,
        "supplier_effect": 0,
        "customer_effect": 0,
        "label": "Leadership change — limited sector impact"
    },
    "EXEC_DEPARTURE": {
        "sector_effect": -0.05,
        "competitor_effect": +0.05,
        "supplier_effect": -0.05,
        "customer_effect": 0,
        "label": "Executive departure may benefit competitors"
    },
    "ACTIVIST_FILING": {
        "sector_effect": +0.1,
        "competitor_effect": +0.15,
        "supplier_effect": 0,
        "customer_effect": 0,
        "label": "Activist pressure may drive sector-wide governance focus"
    },
    "LEGAL_REGULATORY": {
        "sector_effect": -0.2,
        "competitor_effect": +0.1,
        "supplier_effect": -0.1,
        "customer_effect": 0,
        "label": "Regulatory action may constrain sector peers"
    },
    "INSIDER_BUY": {
        "sector_effect": +0.05,
        "competitor_effect": 0,
        "supplier_effect": 0,
        "customer_effect": 0,
        "label": "Insider buying signals confidence"
    },
    "INSIDER_SELL": {
        "sector_effect": -0.05,
        "competitor_effect": +0.02,
        "supplier_effect": -0.03,
        "customer_effect": 0,
        "label": "Insider selling may signal caution"
    },
    "IPO_REGISTRATION": {
        "sector_effect": +0.1,
        "competitor_effect": -0.05,
        "supplier_effect": +0.05,
        "customer_effect": 0,
        "label": "IPO signals sector growth and valuation confidence"
    },
    "DEBT_FINANCING": {
        "sector_effect": 0,
        "competitor_effect": 0,
        "supplier_effect": 0,
        "customer_effect": 0,
        "label": "Debt financing — company-specific impact"
    },
    "ROUTINE_ADMIN": {
        "sector_effect": 0,
        "competitor_effect": 0,
        "supplier_effect": 0,
        "customer_effect": 0,
        "label": "Routine filing — no sector propagation"
    },
}


def _find_sector(ticker: str) -> Optional[str]:
    """Find the sector for a ticker."""
    return _TICKER_TO_SECTOR.get(ticker.upper())


def get_ripple_targets(ticker: str, event_type: str) -> list[dict]:
    """
    Returns list of affected companies with estimated impact direction.
    This is the core 'sector ripple' analysis.
    """
    ticker = ticker.upper()
    sector = _find_sector(ticker)
    rules = EVENT_PROPAGATION_RULES.get(event_type, EVENT_PROPAGATION_RULES.get("ROUTINE_ADMIN", {}))

    targets = []

    # 1. Sector peers
    if sector:
        for peer in SECTOR_MAP.get(sector, []):
            if peer != ticker:
                effect = rules.get("sector_effect", 0)
                if effect != 0:
                    targets.append({
                        "ticker": peer,
                        "relation": "sector_peer",
                        "sector": sector,
                        "estimated_effect": effect,
                        "direction": "↑" if effect > 0 else "↓",
                        "reason": f"Same sector ({sector})"
                    })

    # 2. Supply chain — customers
    chain = SUPPLY_CHAIN.get(ticker, {})
    for customer in chain.get("customers", []):
        effect = rules.get("customer_effect", rules.get("sector_effect", 0)) * 0.8
        if effect != 0:
            targets.append({
                "ticker": customer,
                "relation": "customer",
                "sector": _find_sector(customer),
                "estimated_effect": round(effect, 3),
                "direction": "↑" if effect > 0 else "↓",
                "reason": f"Direct customer of {ticker}"
            })

    # 3. Supply chain — suppliers
    for supplier in chain.get("suppliers", []):
        effect = rules.get("supplier_effect", 0)
        if effect != 0:
            targets.append({
                "ticker": supplier,
                "relation": "supplier",
                "sector": _find_sector(supplier),
                "estimated_effect": round(effect, 3),
                "direction": "↑" if effect > 0 else "↓",
                "reason": f"Supplier to {ticker}"
            })

    # Sort by absolute effect size, take top 8
    targets = sorted(targets, key=lambda x: abs(x["estimated_effect"]), reverse=True)[:8]

    return targets


def build_graph_data(signals: list) -> dict:
    """
    Build force-graph data for the GRAPH view.
    Returns { nodes: [...], edges: [...] }
    Combines static sector/supply-chain structure with live signal overlays.
    """
    nodes = {}
    edges = []
    edge_set = set()

    # Build node set from all sector tickers
    for sector, tickers in SECTOR_MAP.items():
        for t in tickers:
            nodes[t] = {
                "id": t,
                "ticker": t,
                "sector": sector,
                "signal": None,
                "score": 0,
                "has_signal": False,
            }

    # Overlay live signal data
    for sig in (signals or []):
        t = sig.get("ticker", "").upper()
        if t in nodes:
            nodes[t]["signal"] = sig.get("signal") or sig.get("classification")
            nodes[t]["score"] = sig.get("impact_score") or sig.get("confidence", 0)
            nodes[t]["has_signal"] = True
            nodes[t]["event_type"] = sig.get("event_type")
            nodes[t]["summary"] = (sig.get("summary") or "")[:80]

    # Build edges from sector relationships
    for sector, tickers in SECTOR_MAP.items():
        for i, t1 in enumerate(tickers):
            for t2 in tickers[i+1:]:
                edge_key = tuple(sorted([t1, t2]))
                if edge_key not in edge_set:
                    edge_set.add(edge_key)
                    edges.append({
                        "source": t1,
                        "target": t2,
                        "weight": 0.3,
                        "type": "sector",
                        "sector": sector,
                    })

    # Build edges from supply chain (only between nodes that exist in the graph)
    for ticker, chain in SUPPLY_CHAIN.items():
        if ticker not in nodes:
            continue
        for customer in chain.get("customers", []):
            if customer not in nodes:
                continue
            edge_key = tuple(sorted([ticker, customer]))
            if edge_key not in edge_set:
                edge_set.add(edge_key)
                edges.append({
                    "source": ticker,
                    "target": customer,
                    "weight": 0.7,
                    "type": "supply_chain",
                    "label": f"{ticker} → {customer}",
                })
        for supplier in chain.get("suppliers", []):
            if supplier not in nodes:
                continue
            edge_key = tuple(sorted([ticker, supplier]))
            if edge_key not in edge_set:
                edge_set.add(edge_key)
                edges.append({
                    "source": supplier,
                    "target": ticker,
                    "weight": 0.6,
                    "type": "supply_chain",
                    "label": f"{supplier} → {ticker}",
                })

    return {
        "nodes": list(nodes.values()),
        "edges": edges,
        "sectors": list(SECTOR_MAP.keys()),
    }


def build_event_chains(signals: list) -> list[dict]:
    """
    Group signals into 'event chains' — signals from the same sector
    within a 4-hour window are correlated clusters.
    Returns chains sorted by total chain impact.
    """
    from dateutil.parser import parse as parse_dt

    chains = []
    used = set()

    # Sort by filing time
    sorted_signals = sorted(signals, key=lambda x: x.get("filed_at", ""))

    for signal in sorted_signals:
        sid = signal.get("id")
        if sid in used:
            continue

        chain = [signal]
        used.add(sid)
        ticker_sector = _find_sector(signal.get("ticker", ""))

        if not ticker_sector:
            continue

        try:
            signal_time = parse_dt(signal.get("filed_at", ""))
        except Exception:
            continue

        for other in sorted_signals:
            oid = other.get("id")
            if oid in used:
                continue
            if _find_sector(other.get("ticker", "")) == ticker_sector:
                try:
                    other_time = parse_dt(other.get("filed_at", ""))
                    time_diff = abs((other_time - signal_time).total_seconds())
                    if time_diff < 14400:  # 4-hour window
                        chain.append(other)
                        used.add(oid)
                except Exception:
                    continue

        if len(chain) > 1:
            chains.append({
                "sector": ticker_sector,
                "events": chain,
                "trigger": chain[0],
                "chain_length": len(chain),
                "chain_impact": sum(e.get("impact_score", 0) or 0 for e in chain),
                "tickers": list(set(e.get("ticker", "") for e in chain)),
            })

    return sorted(chains, key=lambda x: x["chain_impact"], reverse=True)


# ── NEW: Competitor map (for build_correlations) ────────────────────────────
COMPETITORS = {
    "NVDA": ["AMD", "INTC", "QCOM"],
    "AMD":  ["NVDA", "INTC"],
    "INTC": ["NVDA", "AMD", "TSM"],
    "AAPL": ["MSFT", "GOOG"],
    "MSFT": ["AAPL", "GOOG", "AMZN"],
    "GOOG": ["MSFT", "META", "AAPL"],
    "META": ["GOOG", "SNAP"],
    "AMZN": ["MSFT", "WMT", "GOOG"],
    "TSLA": ["RIVN", "GM", "F", "LCID", "NIO"],
    "COIN": ["SQ", "HOOD", "MSTR"],
    "NFLX": ["DIS", "WBD", "PARA"],
    "JPM":  ["BAC", "WFC", "GS", "MS"],
    "GS":   ["MS", "JPM", "BAC"],
    "XOM":  ["CVX", "COP", "BP"],
    "CVX":  ["XOM", "COP"],
    "LMT":  ["RTX", "NOC", "GD", "BA"],
    "WMT":  ["TGT", "COST", "AMZN"],
    "PFE":  ["MRK", "JNJ", "ABBV", "LLY"],
    "V":    ["MA", "PYPL", "AXP"],
    "CRM":  ["NOW", "MSFT", "SAP"],
    "SNOW": ["DDOG", "MDB", "AMZN"],
}

# ── NEW: Ticker → sector label (display-friendly) ───────────────────────────
TICKER_SECTOR = {
    "NVDA":"Semiconductors","AMD":"Semiconductors","INTC":"Semiconductors",
    "TSM":"Semiconductors","ASML":"Semiconductors","QCOM":"Semiconductors",
    "AVGO":"Semiconductors","LRCX":"Semiconductors","KLAC":"Semiconductors",
    "AMAT":"Semiconductors","MU":"Semiconductors","MRVL":"Semiconductors",
    "AAPL":"Big Tech","MSFT":"Big Tech","GOOG":"Big Tech",
    "META":"Big Tech","AMZN":"Big Tech","NFLX":"Big Tech",
    "CRM":"Cloud","NOW":"Cloud","SNOW":"Cloud","DDOG":"Cloud",
    "NET":"Cloud","MDB":"Cloud","ZS":"Cloud","OKTA":"Cloud",
    "V":"Fintech","MA":"Fintech","PYPL":"Fintech","SQ":"Fintech",
    "COIN":"Fintech","AFRM":"Fintech","HOOD":"Fintech",
    "TSLA":"EV/Auto","RIVN":"EV/Auto","LCID":"EV/Auto",
    "GM":"EV/Auto","F":"EV/Auto","NIO":"EV/Auto",
    "XOM":"Energy","CVX":"Energy","COP":"Energy",
    "SLB":"Energy","HAL":"Energy","BP":"Energy",
    "JPM":"Banking","BAC":"Banking","WFC":"Banking",
    "GS":"Banking","MS":"Banking","C":"Banking",
    "PFE":"Pharma","MRK":"Pharma","JNJ":"Pharma",
    "ABBV":"Pharma","LLY":"Pharma","GILD":"Pharma",
    "BMY":"Pharma","AMGN":"Pharma",
    "LMT":"Defense","RTX":"Defense","NOC":"Defense",
    "GD":"Defense","BA":"Defense","HII":"Defense",
    "WMT":"Retail","TGT":"Retail","COST":"Retail",
    "HD":"Retail","LOW":"Retail",
    "AAL":"Airlines","DAL":"Airlines","UAL":"Airlines",
    "LUV":"Airlines","JBLU":"Airlines",
}

# ── NEW: Sector ripple rules ─────────────────────────────────────────────────
_SECTOR_RIPPLE = {
    ("Semiconductors", "EARNINGS_BEAT"): [
        {"sector": "Big Tech", "direction": "positive", "reason": "Better chip supply reduces AI infrastructure costs"},
        {"sector": "Cloud", "direction": "positive", "reason": "GPU availability accelerates cloud expansion"},
        {"sector": "EV/Auto", "direction": "positive", "reason": "Chip supply improves EV production capacity"},
    ],
    ("Semiconductors", "EARNINGS_MISS"): [
        {"sector": "Big Tech", "direction": "negative", "reason": "AI capex may slow if chip demand weakens"},
        {"sector": "Cloud", "direction": "negative", "reason": "Data center expansion may face headwinds"},
    ],
    ("Energy", "EARNINGS_BEAT"): [
        {"sector": "Airlines", "direction": "negative", "reason": "Higher energy prices increase jet fuel costs"},
        {"sector": "EV/Auto", "direction": "positive", "reason": "Oil price strength accelerates EV adoption"},
        {"sector": "Defense", "direction": "positive", "reason": "Energy geopolitics drive defense spending"},
    ],
    ("Banking", "EARNINGS_BEAT"): [
        {"sector": "Fintech", "direction": "negative", "reason": "Strong bank results reduce fintech disruption narrative"},
        {"sector": "Big Tech", "direction": "positive", "reason": "Healthy credit markets support tech M&A"},
    ],
    ("Big Tech", "EARNINGS_BEAT"): [
        {"sector": "Cloud", "direction": "positive", "reason": "Enterprise cloud spend confirmed strong"},
        {"sector": "Semiconductors", "direction": "positive", "reason": "High AI spend confirms chip demand"},
    ],
    ("Pharma", "REGULATORY_ACTION"): [
        {"sector": "Pharma", "direction": "negative", "reason": "Regulatory risk reprices entire sector"},
    ],
    ("EV/Auto", "EARNINGS_MISS"): [
        {"sector": "Semiconductors", "direction": "negative", "reason": "Weaker EV demand reduces chip orders"},
        {"sector": "Energy", "direction": "positive", "reason": "EV slowdown delays oil demand decline"},
    ],
}

# ── NEW: Macro event rules ───────────────────────────────────────────────────
_MACRO_RULES = {
    "INTEREST_RATE_HIKE": [
        {"sector": "Banking", "direction": "positive", "reason": "Higher rates improve net interest margin"},
        {"sector": "Big Tech", "direction": "negative", "reason": "Rate hikes compress growth stock multiples"},
        {"sector": "Fintech", "direction": "negative", "reason": "Higher cost of capital hurts lending fintechs"},
    ],
    "OIL_SPIKE": [
        {"sector": "Energy", "direction": "positive", "reason": "Direct revenue benefit from higher oil prices"},
        {"sector": "Airlines", "direction": "negative", "reason": "Jet fuel is 20-30% of airline operating costs"},
        {"sector": "EV/Auto", "direction": "positive", "reason": "Oil spike accelerates EV adoption"},
    ],
}


def build_correlations(signal: dict, enrichment_data: dict) -> dict:
    """
    Per-signal correlation enrichment. Called from signal_pipeline after classification.
    Returns structured correlation data for DB storage.
    signal: dict with keys 'ticker', 'event_type', 'signal'
    enrichment_data: dict from enrichment pipeline (may have 'news_dominant_theme')
    """
    ticker = (signal.get("ticker") or "").upper()
    event_type = signal.get("event_type", "")
    signal_direction = signal.get("signal", "Neutral")
    sector = TICKER_SECTOR.get(ticker, "Unknown")

    related_entities = []
    sector_links = []
    chain_reactions = []

    # 1. Competitor impact (usually inverse)
    for competitor in COMPETITORS.get(ticker, []):
        comp_sector = TICKER_SECTOR.get(competitor, sector)
        direction = (
            "negative" if signal_direction == "Positive"
            else "positive" if signal_direction == "Risk"
            else "neutral"
        )
        related_entities.append({
            "ticker": competitor,
            "relationship": "competitor",
            "sector": comp_sector,
            "impact_direction": direction,
            "reason": (
                f"{ticker} strength puts competitive pressure on {competitor}"
                if signal_direction == "Positive"
                else f"{ticker} weakness may benefit {competitor}"
            ),
            "confidence": 0.7,
        })

    # 2. Supply chain (use existing SUPPLY_CHAIN dict)
    sc = SUPPLY_CHAIN.get(ticker, {})
    for supplier in sc.get("suppliers", []):
        related_entities.append({
            "ticker": supplier,
            "relationship": "supplier",
            "sector": TICKER_SECTOR.get(supplier, "Unknown"),
            "impact_direction": (
                "positive" if signal_direction == "Positive"
                else "negative" if signal_direction == "Risk"
                else "neutral"
            ),
            "reason": (
                f"{ticker} growth drives higher orders for {supplier}"
                if signal_direction == "Positive"
                else f"{ticker} slowdown reduces orders from {supplier}"
            ),
            "confidence": 0.8,
        })
    for customer in sc.get("customers", []):
        related_entities.append({
            "ticker": customer,
            "relationship": "customer",
            "sector": TICKER_SECTOR.get(customer, "Unknown"),
            "impact_direction": (
                "positive" if signal_direction == "Positive"
                else "negative" if signal_direction == "Risk"
                else "neutral"
            ),
            "reason": (
                f"{ticker} supply improvement benefits {customer}"
                if signal_direction == "Positive"
                else f"{ticker} supply issues create risk for {customer}"
            ),
            "confidence": 0.75,
        })

    # 3. Sector ripple
    ripple_key = (sector, event_type)
    for ripple in _SECTOR_RIPPLE.get(ripple_key, []):
        sector_links.append({
            "sector": ripple["sector"],
            "direction": ripple["direction"],
            "reason": ripple["reason"],
            "triggered_by": f"{ticker} {event_type}",
            "confidence": 0.65,
        })

    # 4. Chain reactions
    if event_type == "EARNINGS_BEAT":
        chain_reactions = [
            {"layer": "immediate", "effect": f"{ticker} stock likely gaps up at open", "timeframe": "0-24h"},
            {"layer": "secondary", "effect": f"Competitors ({', '.join(COMPETITORS.get(ticker, [])[:2])}) may face selling pressure", "timeframe": "1-3 days"},
            {"layer": "sector_ripple", "effect": f"{sector} sector ETF likely outperforms", "timeframe": "1-5 days"},
        ]
    elif event_type == "EARNINGS_MISS":
        chain_reactions = [
            {"layer": "immediate", "effect": f"{ticker} stock likely gaps down at open", "timeframe": "0-24h"},
            {"layer": "secondary", "effect": f"Analysts may downgrade sector peers. Watch: {', '.join(COMPETITORS.get(ticker, [])[:2])}", "timeframe": "1-3 days"},
            {"layer": "sector_ripple", "effect": f"Risk-off sentiment may spread across {sector}", "timeframe": "2-7 days"},
        ]
    elif event_type in ("EXEC_DEPARTURE", "EXEC_HIRE"):
        chain_reactions = [
            {"layer": "immediate", "effect": "Volatility spike as market reprices leadership risk", "timeframe": "0-48h"},
            {"layer": "secondary", "effect": "Strategy uncertainty may delay enterprise deals", "timeframe": "1-4 weeks"},
        ]
    elif event_type == "ACTIVIST_ENTRY":
        chain_reactions = [
            {"layer": "immediate", "effect": "Stock premium on takeover/restructuring speculation", "timeframe": "0-24h"},
            {"layer": "secondary", "effect": "Peers may see activist copycat positioning", "timeframe": "1-4 weeks"},
        ]
    elif event_type == "MERGER_ACQUISITION":
        chain_reactions = [
            {"layer": "immediate", "effect": "Target stock premiums typically 20-40% on announcement", "timeframe": "0-24h"},
            {"layer": "secondary", "effect": "Acquirer may face integration cost concerns", "timeframe": "1-4 weeks"},
            {"layer": "sector_ripple", "effect": "M&A activity often triggers sector consolidation wave", "timeframe": "1-6 months"},
        ]

    # 5. Macro links
    macro_links = []
    news_theme = (enrichment_data.get("news_dominant_theme") or "").lower()
    if "rate" in news_theme or "fed" in news_theme:
        macro_links.extend(_MACRO_RULES.get("INTEREST_RATE_HIKE", []))
    if "oil" in news_theme or "energy" in news_theme:
        macro_links.extend(_MACRO_RULES.get("OIL_SPIKE", []))

    return {
        "related_entities": related_entities[:10],
        "sector_links": sector_links,
        "macro_links": macro_links,
        "chain_reactions": chain_reactions,
        "sector": sector,
        "correlation_version": "1.0",
    }
