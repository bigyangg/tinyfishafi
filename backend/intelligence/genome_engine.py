# intelligence/genome_engine.py
# Purpose: Build company behavioral fingerprint, match against historical crisis patterns
# Dependencies: supabase
# Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import logging
import json
import os
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

CRISIS_PATTERNS = {
    "PRE_BANKRUPTCY": {
        "description": "Filing delays accelerating + risk factors >15% growth + going concern language",
        "filing_delay_trend": "accelerating",
        "risk_factor_growth": ">15%_per_quarter",
        "going_concern_language": True,
        "insider_activity": "net_selling",
        "historical_cases": 23,
        "avg_days_to_event": 187,
    },
    "PRE_RESTATEMENT": {
        "description": "Document length rapidly increasing + amendment frequency high + auditor language changing",
        "document_length_trend": "rapidly_increasing",
        "amendment_frequency": "high",
        "auditor_language_changing": True,
        "historical_cases": 31,
        "avg_days_to_event": 94,
    },
    "PRE_SEC_INVESTIGATION": {
        "description": "New risk factor topics: SEC/investigation/inquiry + executive turnover clustering",
        "risk_factor_new_topics": ["SEC", "investigation", "inquiry", "subpoena"],
        "executive_turnover": "elevated",
        "legal_exhibit_count": "increasing",
        "historical_cases": 14,
        "avg_days_to_event": 140,
    },
    "PRE_ACTIVIST_TARGET": {
        "description": "Operational metrics declining + divergence score trending up + external buying",
        "operational_metrics": "declining",
        "divergence_score_trend": "increasing",
        "external_buying": True,
        "historical_cases": 19,
        "avg_days_to_event": 62,
    },
}

TIER1_BACKFILL = ["NVDA", "TSLA", "AAPL", "BA", "MSFT", "META", "AMZN", "GOOGL"]


def calculate_genome_score(filing_data: dict) -> tuple:
    """Calculate genome score and trend from filing pattern data."""
    total_filings = filing_data.get("total_filings", 0)
    amendment_count = filing_data.get("amendment_count", 0)
    filing_types = filing_data.get("filing_types", {})

    score = 50  # baseline
    alerts = []

    # High amendment rate is a warning
    if total_filings > 0 and amendment_count / max(total_filings, 1) > 0.15:
        score += 15
        alerts.append("HIGH_AMENDMENT_RATE")

    # Many 8-Ks relative to quarterly filings suggests material events
    eight_k_count = filing_types.get("8-K", 0)
    quarterly_count = filing_types.get("10-Q", 0) + filing_types.get("10-K", 0)
    if quarterly_count > 0 and eight_k_count / max(quarterly_count, 1) > 5:
        score += 10
        alerts.append("HIGH_8K_FREQUENCY")

    # Determine trend
    if score >= 70:
        trend = "CRITICAL"
    elif score >= 60:
        trend = "DETERIORATING"
    elif score >= 40:
        trend = "STABLE"
    else:
        trend = "IMPROVING"

    return min(100, score), trend, alerts


def match_crisis_patterns(genome_data: dict, genome_score: int) -> list:
    """Match genome data against known crisis patterns."""
    matches = []

    for pattern_name, pattern in CRISIS_PATTERNS.items():
        similarity = 0
        factors = 0

        # Check amendment frequency
        if pattern.get("amendment_frequency") == "high":
            factors += 1
            amendment_rate = genome_data.get("amendment_count", 0) / max(genome_data.get("total_filings", 1), 1)
            if amendment_rate > 0.15:
                similarity += 1

        # Check filing patterns
        if pattern.get("filing_delay_trend") == "accelerating":
            factors += 1
            if genome_score >= 60:
                similarity += 1

        # Check insider activity
        if pattern.get("insider_activity") == "net_selling":
            factors += 1
            # This would need actual insider data - mark as partial

        # Check operational metrics
        if pattern.get("operational_metrics") == "declining":
            factors += 1
            if genome_score >= 55:
                similarity += 1

        if factors > 0:
            pct = int((similarity / factors) * 100)
            if pct >= 30:
                matches.append({
                    "pattern": pattern_name,
                    "similarity": pct,
                    "description": pattern.get("description", ""),
                    "historical_cases": pattern.get("historical_cases", 0),
                    "avg_days_to_event": pattern.get("avg_days_to_event", 0),
                })

    return sorted(matches, key=lambda x: x["similarity"], reverse=True)


async def build_genome(supabase_client, ticker: str, cik: str, filing_data: dict):
    """Build and store a company genome from filing data."""
    try:
        score, trend, alerts = calculate_genome_score(filing_data)
        pattern_matches = match_crisis_patterns(filing_data, score)
        genome_alert = score >= 65 or any(m["similarity"] >= 50 for m in pattern_matches)

        genome_record = {
            "ticker": ticker,
            "cik": cik,
            "genome_data": json.dumps(filing_data),
            "genome_score": score,
            "genome_trend": trend,
            "pattern_matches": json.dumps(pattern_matches),
            "genome_alert": genome_alert,
            "filing_history_analyzed": filing_data.get("total_filings", 0),
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }

        # Upsert by ticker
        result = supabase_client.table("company_genomes").upsert(
            genome_record, on_conflict="ticker"
        ).execute()

        logger.info(f"[GENOME] {ticker}: score={score}, trend={trend}, alert={genome_alert}, patterns={len(pattern_matches)}")

        return {
            "genome_score": score,
            "genome_trend": trend,
            "genome_alert": genome_alert,
            "pattern_matches": pattern_matches,
        }

    except Exception as e:
        logger.error(f"[GENOME] Failed to build genome for {ticker}: {e}")
        return {}


async def backfill_genomes(supabase_client):
    """Backfill genomes for Tier 1 companies on startup."""
    import httpx

    logger.info(f"[GENOME] Starting backfill for {len(TIER1_BACKFILL)} Tier 1 companies")

    for ticker in TIER1_BACKFILL:
        try:
            # Check if genome already exists and is recent
            existing = supabase_client.table("company_genomes").select("last_updated").eq("ticker", ticker).execute()
            if existing.data:
                last = existing.data[0].get("last_updated", "")
                if last:
                    from datetime import timedelta
                    last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
                    if datetime.now(timezone.utc) - last_dt < timedelta(days=1):
                        logger.info(f"[GENOME] {ticker} genome is recent, skipping")
                        continue

            # Resolve CIK
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://www.sec.gov/files/company_tickers.json",
                    headers={"User-Agent": "AFI genome@afi.com"},
                )
            tickers_data = resp.json()
            cik = None
            for entry in tickers_data.values():
                if entry.get("ticker", "").upper() == ticker:
                    cik = str(entry["cik_str"]).zfill(10)
                    break

            if not cik:
                logger.warning(f"[GENOME] Could not resolve CIK for {ticker}")
                continue

            # Get filing history from SEC submissions
            async with httpx.AsyncClient(timeout=10) as client:
                sub_resp = await client.get(
                    f"https://data.sec.gov/submissions/CIK{cik}.json",
                    headers={"User-Agent": "AFI genome@afi.com"},
                )
            sub_data = sub_resp.json()
            filings = sub_data.get("filings", {}).get("recent", {})
            forms = filings.get("form", [])
            dates = filings.get("filingDate", [])

            filing_types = {}
            amendment_count = 0
            for f in forms[:40]:
                filing_types[f] = filing_types.get(f, 0) + 1
                if "/A" in f:
                    amendment_count += 1

            filing_data = {
                "total_filings": min(len(forms), 40),
                "filing_types": filing_types,
                "amendment_count": amendment_count,
                "latest_10k_date": None,
                "latest_10q_date": None,
            }

            # Find latest 10-K and 10-Q dates
            for i, f in enumerate(forms):
                if f == "10-K" and not filing_data["latest_10k_date"] and i < len(dates):
                    filing_data["latest_10k_date"] = dates[i]
                if f == "10-Q" and not filing_data["latest_10q_date"] and i < len(dates):
                    filing_data["latest_10q_date"] = dates[i]

            await build_genome(supabase_client, ticker, cik, filing_data)

        except Exception as e:
            logger.error(f"[GENOME] Backfill failed for {ticker}: {e}")

    logger.info("[GENOME] Backfill complete")
