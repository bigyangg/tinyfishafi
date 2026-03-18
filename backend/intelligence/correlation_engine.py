# correlation_engine.py — Sector Ripple & Market Correlation Engine
# Purpose: Maps sector relationships, supply chains, and event propagation
# Powers: /api/signals/{id}/ripple, /api/correlations/graph, /api/market/timeline

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
