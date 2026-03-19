# intelligence/enrichment_pipeline.py
# Purpose: Fire all 7 agents simultaneously, synthesize into enriched signal data
# Dependencies: all agents, httpx
# Env vars: TINYFISH_API_KEY, GEMINI_API_KEY, EMERGENT_LLM_KEY
# This is the v3 orchestrator that wraps the existing signal_pipeline.py

import asyncio
import logging
import json
import os

import httpx

logger = logging.getLogger(__name__)

DIVERGENCE_PROMPT = """You are a forensic financial analyst detecting management deception.

Compare these two texts from the same company on the same date:

PUBLIC STATEMENT (press release / IR page):
{public_statement}

LEGAL FILING (SEC document — what they are legally required to disclose):
{filing_text}

Return ONLY valid JSON, nothing else:
{{
  "divergence_score": 0,
  "severity": "LOW",
  "contradiction_found": false,
  "public_claim": "exact quote of the most contradicted public claim",
  "filing_reality": "what the filing actually says about this topic",
  "contradiction_summary": "one sentence plain English explanation of the contradiction"
}}

Score 0 = perfectly consistent. Score 100 = direct, material contradiction.
Score above 60 = alert-worthy. Score above 80 = CRITICAL."""


async def _tinyfish_enrich_market_context(ticker: str, company: str) -> dict:
    """
    Use TinyFish to get live market context from Yahoo Finance.
    This is a showcase of TinyFish for JS-rendered pages.
    Runs in parallel with other enrichment agents.
    """
    import httpx
    import json as _json
    import os as _os

    api_key = _os.environ.get("TINYFISH_API_KEY", "")
    if not api_key or _os.environ.get("USE_TINYFISH", "true").lower() != "true":
        return {}

    url = f"https://finance.yahoo.com/quote/{ticker}"
    goal = (
        f'Return as JSON: {{"price": number, "change_pct": number, '
        f'"volume": number, "market_cap": string, "analyst_rating": string}}\n'
        f'Get current stock data for {ticker} from this page.'
    )

    try:
        result_data = None
        async with httpx.AsyncClient(timeout=25.0) as client:
            async with client.stream(
                "POST",
                "https://agent.tinyfish.ai/v1/automation/run-sse",
                headers={
                    "X-API-Key": api_key,
                    "Content-Type": "application/json",
                },
                json={"url": url, "goal": goal},
                timeout=25.0,
            ) as resp:
                if resp.status_code != 200:
                    return {}
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    try:
                        event = _json.loads(line[6:])
                        if event.get("status") == "COMPLETED":
                            result_data = event.get("resultJson") or event.get("result") or {}
                            if isinstance(result_data, str):
                                result_data = _json.loads(result_data)
                            break
                        if event.get("status") in ("FAILED", "REJECTED", "ERROR"):
                            logger.warning(f"[TinyFish/market] {ticker}: {event.get('reason', 'rejected')}")
                            return {}
                    except Exception:
                        continue

        if result_data and isinstance(result_data, dict):
            logger.info(f"[TinyFish/market] {ticker}: got market context")
            return {
                "tf_price": result_data.get("price"),
                "tf_change_pct": result_data.get("change_pct"),
                "tf_volume": result_data.get("volume"),
                "tf_market_cap": result_data.get("market_cap"),
                "tf_analyst_rating": result_data.get("analyst_rating"),
            }
    except asyncio.TimeoutError:
        logger.info(f"[TinyFish/market] {ticker}: timeout — skipping")
    except Exception as e:
        logger.warning(f"[TinyFish/market] {ticker}: {str(e)[:80]}")

    return {}


async def run_enrichment_agents(ticker: str, accession_number: str, cik: str,
                                 company_name: str) -> dict:
    """Fire all 8 enrichment agents + TinyFish market context simultaneously."""
    from agents.edgar_filing_agent import EdgarFilingAgent
    from agents.news_agent import NewsAgent
    from agents.social_agent import SocialSentimentAgent
    from agents.insider_agent import InsiderTransactionAgent
    from agents.congress_agent import CongressTradingAgent
    from agents.divergence_agent import DivergenceDetectionAgent
    from agents.genome_agent import GenomeAgent
    from agents.options_agent import OptionsActivityAgent

    logger.info(f"[ENRICHMENT] Firing 8 agents + TinyFish market context for {ticker}")

    results = await asyncio.gather(
        EdgarFilingAgent().execute(accession_number=accession_number, cik=cik),
        NewsAgent().execute(ticker=ticker),
        SocialSentimentAgent().execute(ticker=ticker),
        InsiderTransactionAgent().execute(cik=cik, ticker=ticker),
        CongressTradingAgent().execute(ticker=ticker),
        DivergenceDetectionAgent().execute(ticker=ticker, company_name=company_name),
        GenomeAgent().execute(ticker=ticker, cik=cik),
        OptionsActivityAgent().execute(ticker=ticker),
        _tinyfish_enrich_market_context(ticker=ticker, company=company_name),
        return_exceptions=True,
    )

    agent_names = ["edgar", "news", "social", "insider", "congress", "divergence", "genome", "options", "tinyfish_market"]
    enrichment = {}
    for i, name in enumerate(agent_names):
        r = results[i]
        enrichment[name] = r if isinstance(r, dict) else {}

    # Merge TinyFish market context into top-level enrichment dict
    tf_market = enrichment.pop("tinyfish_market", {})
    if tf_market:
        enrichment["tinyfish_market"] = tf_market
        logger.info(f"[ENRICHMENT] TinyFish market context for {ticker}: {list(tf_market.keys())}")

    logger.info(f"[ENRICHMENT] All agents complete for {ticker}")
    return enrichment


async def download_document(document_url: str) -> str:
    """Download filing document via direct HTTP (fast, not TinyFish)."""
    if not document_url:
        return ""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                document_url,
                headers={"User-Agent": "AFI/1.0 info@afi.com"},
                follow_redirects=True,
            )
            if resp.status_code == 200:
                return resp.text[:50000]
    except Exception as e:
        logger.warning(f"[ENRICHMENT] Document download failed: {e}")
    return ""


async def run_divergence_analysis(filing_text: str, public_statement: str) -> dict:
    """Compare filing vs public statement using Gemini via Emergent key."""
    if not filing_text or not public_statement:
        return {"divergence_score": 0, "severity": "LOW", "contradiction_found": False}

    try:
        emergent_key = os.getenv("EMERGENT_LLM_KEY", "")
        gemini_key = os.getenv("GEMINI_API_KEY", "")

        prompt = DIVERGENCE_PROMPT.format(
            public_statement=public_statement[:3000],
            filing_text=filing_text[:5000],
        )

        if emergent_key:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = LlmChat(
                api_key=emergent_key,
                session_id=f"divergence-{id(filing_text)}",
                system_message="You are a forensic financial analyst. Return only valid JSON.",
            )
            chat.with_model("gemini", "gemini-2.5-flash")
            response_text = await chat.send_message(UserMessage(text=prompt))
        elif gemini_key and not gemini_key.startswith("your-"):
            from google import genai as _genai
            from google.genai import types as _genai_types
            _client = _genai.Client(api_key=gemini_key)
            _response = _client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
            )
            response_text = _response.text
        else:
            return {"divergence_score": 0, "severity": "LOW", "contradiction_found": False}

        text = response_text.strip()
        if text.startswith("```"):
            parts = text.split("```")
            if len(parts) >= 2:
                text = parts[1]
                if text.startswith("json"):
                    text = text[4:]
                text = text.strip()
        return json.loads(text)

    except Exception as e:
        logger.error(f"[ENRICHMENT] Divergence analysis failed: {e}")
        return {"divergence_score": 0, "severity": "LOW", "contradiction_found": False}


def compute_divergence_score(
    filing_signal: str,
    news_sentiment: str | None,
    social_sentiment: str | None,
    ticker: str,
) -> dict:
    """Compute divergence between filing signal and market sentiment.

    Returns a dict with score (0-100), type string, and details string.
    Pure synchronous — safe to call from _process_inner.
    """
    signal_map = {"Positive": 1, "Neutral": 0, "Risk": -1, "Pending": 0}
    sentiment_map = {
        "positive": 1, "bullish": 1,
        "neutral": 0,
        "bearish": -1, "negative": -1, "risk": -1,
    }

    filing_val = signal_map.get(filing_signal, 0)
    news_val = sentiment_map.get((news_sentiment or "").lower(), 0)
    social_val = sentiment_map.get((social_sentiment or "").lower(), 0)

    score = 0
    divergence_type = "NONE"
    details = []

    # News divergence (weighted heavier — 40 pts max)
    if news_sentiment and filing_val != news_val:
        diff = abs(filing_val - news_val)
        score += diff * 40
        if filing_val > news_val:
            divergence_type = "BULLISH_FILING_BEARISH_NEWS" if filing_val > 0 else "NEUTRAL_FILING_BEARISH_NEWS"
            details.append(f"Filing is {filing_signal} but news is {news_sentiment}")
        else:
            divergence_type = "BEARISH_FILING_BULLISH_NEWS" if filing_val < 0 else "NEUTRAL_FILING_BULLISH_NEWS"
            details.append(f"Filing is {filing_signal} but news is {news_sentiment}")

    # Social divergence (20 pts max)
    if social_sentiment and filing_val != social_val:
        diff = abs(filing_val - social_val)
        score += diff * 20

    score = min(100, score)

    return {
        "score": score,
        "type": divergence_type if score > 20 else "NONE",
        "details": "; ".join(details) if details else "No significant divergence",
    }


def build_enrichment_columns(enrichment: dict, divergence_data: dict) -> dict:
    """Convert agent results into flat columns for Supabase signals table."""
    news = enrichment.get("news", {})
    social = enrichment.get("social", {})
    insider = enrichment.get("insider", {})
    congress = enrichment.get("congress", {})
    genome = enrichment.get("genome", {})
    options_data = enrichment.get("options", {})
    tf_market = enrichment.get("tinyfish_market", {})

    columns = {}

    # News
    headlines = news.get("headlines", [])
    if headlines:
        columns["news_headlines"] = json.dumps(headlines[:8])
    news_sent = news.get("sentiment_score")
    if news_sent is not None:
        columns["news_sentiment"] = str(news_sent)
    theme = news.get("dominant_theme")
    if theme:
        columns["news_dominant_theme"] = theme

    # Social
    if social.get("reddit_sentiment") is not None:
        columns["reddit_sentiment"] = float(social["reddit_sentiment"])
    if social.get("stocktwits_sentiment") is not None:
        columns["stocktwits_sentiment"] = float(social["stocktwits_sentiment"])
    columns["social_volume_spike"] = social.get("volume_spike", False)
    columns["social_vs_filing_delta"] = social.get("social_vs_filing_delta", "NEUTRAL")

    # Insider
    if insider.get("net_30d_value") is not None:
        columns["insider_net_30d"] = float(insider.get("net_30d_value", 0))
    if insider.get("net_90d_value") is not None:
        columns["insider_net_90d"] = float(insider.get("net_90d_value", 0))
    columns["insider_ceo_activity"] = insider.get("ceo_activity", "NONE")
    columns["insider_unusual_delay"] = insider.get("unusual_delay_detected", False)

    # Congress
    columns["congress_net_sentiment"] = congress.get("congress_net_sentiment", "NEUTRAL")
    trades = congress.get("trades_90d", [])
    if trades:
        columns["congress_trades"] = json.dumps(trades[:10])
    columns["congress_suspicious_timing"] = congress.get("suspicious_timing_detected", False)
    columns["congress_timing_note"] = congress.get("timing_note", "")

    # Divergence
    if divergence_data:
        score = divergence_data.get("divergence_score", 0)
        columns["divergence_score"] = int(score) if score else 0
        columns["divergence_severity"] = divergence_data.get("severity", "LOW")
        columns["contradiction_summary"] = divergence_data.get("contradiction_summary", "")
        columns["public_claim"] = divergence_data.get("public_claim", "")
        columns["filing_reality"] = divergence_data.get("filing_reality", "")

    # Genome
    if genome:
        if genome.get("total_filings") is not None:
            # Calculate genome score from filing patterns
            total = genome.get("total_filings", 0)
            amendment_count = genome.get("amendment_count", 0)
            filing_types = genome.get("filing_types", {})
            # Score: higher is better (more filings, fewer amendments = healthier pattern)
            score = min(100, max(0, total * 2 - amendment_count * 10))
            columns["genome_score"] = score
            # Trend based on filing regularity
            if amendment_count > 3:
                columns["genome_trend"] = "DETERIORATING"
            elif total >= 20:
                columns["genome_trend"] = "STABLE"
            elif total >= 10:
                columns["genome_trend"] = "IMPROVING"
            else:
                columns["genome_trend"] = "STABLE"
            # Pattern matches from filing type distribution
            patterns = []
            for ftype, count in filing_types.items():
                if count > 0:
                    similarity = min(100, int(count / max(total, 1) * 200))
                    patterns.append({"pattern": ftype, "count": count, "similarity": similarity})
            if patterns:
                columns["genome_pattern_matches"] = json.dumps(sorted(patterns, key=lambda x: x["count"], reverse=True)[:5])
            # Alert if amendment ratio is high
            columns["genome_alert"] = amendment_count > 2 and total > 0

    # Options activity
    if options_data:
        columns["options_activity"] = json.dumps(options_data)
        pcr = options_data.get("put_call_ratio")
        if pcr is not None:
            columns["put_call_ratio"] = float(pcr)

    # TinyFish market context (Yahoo Finance live data)
    if tf_market:
        columns["tf_market_context"] = json.dumps(tf_market)
        if tf_market.get("tf_price") is not None:
            columns["tf_price"] = tf_market["tf_price"]
        if tf_market.get("tf_change_pct") is not None:
            columns["tf_change_pct"] = tf_market["tf_change_pct"]
        if tf_market.get("tf_analyst_rating"):
            columns["tf_analyst_rating"] = tf_market["tf_analyst_rating"]

    return columns
