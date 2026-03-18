# tinyfish_context.py — Deep Context Enrichment via TinyFish
# Purpose: Fire-and-forget enrichment after signal is stored. Never blocks pipeline.
# Pattern: asyncio.create_task after Step 7 (store) in signal_pipeline.py

import asyncio
import json
import os
import re
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# In-memory cache, keyed by accession_number
DEEP_CONTEXT_CACHE = {}


def extract_entities(text: str) -> list[str]:
    """Extract named entities (companies, people) from filing text."""
    # Simple pattern-based extraction for demo
    entities = set()
    # Match capitalized multi-word names (likely company/person names)
    for match in re.finditer(r'\b([A-Z][a-z]+ (?:[A-Z][a-z]+ ?){1,3})\b', text or ""):
        name = match.group(1).strip()
        if len(name) > 4 and name not in ("The Company", "The Board", "United States"):
            entities.add(name)
    # Match ticker-like patterns
    for match in re.finditer(r'\b([A-Z]{2,5})\b', text or ""):
        entities.add(match.group(1))
    return list(entities)[:15]


def extract_figures(text: str) -> list[dict]:
    """Extract financial figures ($X million, percentages, etc.)."""
    figures = []
    # Dollar amounts
    for match in re.finditer(r'\$[\d,]+(?:\.\d+)?\s*(?:million|billion|thousand|M|B|K)?', text or "", re.IGNORECASE):
        figures.append({"type": "currency", "value": match.group(0).strip()})
    # Percentages
    for match in re.finditer(r'[\d,]+(?:\.\d+)?%', text or ""):
        figures.append({"type": "percentage", "value": match.group(0).strip()})
    # Revenue/earnings patterns
    for match in re.finditer(r'(?:revenue|earnings|net income|EPS|EBITDA)\s*(?:of|was|were|:)\s*\$?[\d,.]+\s*(?:million|billion|per share)?',
                             text or "", re.IGNORECASE):
        figures.append({"type": "metric", "value": match.group(0).strip()})
    return figures[:12]


def detect_risk_phrases(text: str) -> list[str]:
    """Detect risk-related language in filing text."""
    risk_keywords = [
        "material weakness", "going concern", "significant risk",
        "adverse effect", "litigation", "regulatory action",
        "impairment", "restructuring", "layoff", "write-down",
        "default", "breach", "investigation", "restatement",
        "downgrade", "decline in revenue", "loss from operations",
        "cybersecurity incident", "data breach", "supply chain disruption",
    ]
    found = []
    text_lower = (text or "").lower()
    for phrase in risk_keywords:
        if phrase in text_lower:
            # Find the surrounding context
            idx = text_lower.index(phrase)
            start = max(0, idx - 40)
            end = min(len(text_lower), idx + len(phrase) + 40)
            context = text[start:end].strip()
            found.append(context)
    return found[:8]


def detect_guidance(text: str) -> list[str]:
    """Detect forward-looking guidance statements."""
    guidance_patterns = [
        r'(?:expect|anticipate|project|forecast|guide|outlook)[^.]{10,80}\.',
        r'(?:full.year|fiscal.year|next quarter|guidance)[^.]{10,80}\.',
        r'(?:we believe|management believes)[^.]{10,80}\.',
        r'(?:target|goal|objective)\s+(?:of|is|for)[^.]{10,80}\.',
    ]
    found = []
    for pattern in guidance_patterns:
        for match in re.finditer(pattern, text or "", re.IGNORECASE):
            stmt = match.group(0).strip()
            if len(stmt) > 20:
                found.append(stmt)
    return found[:6]


async def enrich_deep_context(signal_id: str, accession: str, ticker: str, supabase_client=None):
    """
    Fire-and-forget deep context enrichment.
    Runs after signal is stored. Never blocks pipeline.
    Timeout: 15s hard cap.
    """
    if not os.getenv("USE_TINYFISH", "true").lower() == "true":
        return

    api_key = os.getenv("TINYFISH_API_KEY", "")

    try:
        filing_text = ""

        # Try TinyFish agent first
        if api_key:
            try:
                import httpx
                async with asyncio.timeout(15):
                    async with httpx.AsyncClient() as client:
                        # Use the existing SEC EFTS full-text search as faster alternative
                        accession_clean = accession.replace("demo_", "").split("_")[0] if "demo_" in accession else accession
                        efts_url = f"https://efts.sec.gov/LATEST/search-index?q=%22{accession_clean}%22&dateRange=custom&startdt=2020-01-01&enddt=2030-01-01"
                        resp = await client.get(
                            efts_url,
                            headers={"User-Agent": "AFI demo@afi.com"},
                            timeout=10,
                        )
                        if resp.status_code == 200:
                            filing_text = resp.text[:20000]
            except Exception as e:
                logger.debug(f"[CONTEXT] TinyFish/EFTS extraction failed for {ticker}: {e}")

        # Fallback: use any cached filing text from Supabase
        if not filing_text and supabase_client:
            try:
                result = supabase_client.table("signals").select("summary,key_facts,form_data").eq("id", signal_id).execute()
                if result.data:
                    row = result.data[0]
                    parts = [row.get("summary", "")]
                    kf = row.get("key_facts")
                    if isinstance(kf, str):
                        try: kf = json.loads(kf)
                        except: kf = []
                    if isinstance(kf, list):
                        parts.extend(kf)
                    fd = row.get("form_data")
                    if isinstance(fd, str):
                        try: fd = json.loads(fd)
                        except: fd = {}
                    if isinstance(fd, dict):
                        parts.append(json.dumps(fd))
                    filing_text = " ".join(str(p) for p in parts if p)
            except Exception:
                pass

        if not filing_text:
            DEEP_CONTEXT_CACHE[accession] = None
            return

        # Extract deep context
        context = {
            "key_entities": extract_entities(filing_text),
            "financial_figures": extract_figures(filing_text),
            "risk_language": detect_risk_phrases(filing_text),
            "forward_guidance": detect_guidance(filing_text),
            "extraction_completeness": min(100, int(len(filing_text) / 200)),
            "extracted_at": datetime.utcnow().isoformat(),
        }

        DEEP_CONTEXT_CACHE[accession] = context

        # Persist to Supabase if client available
        if supabase_client:
            try:
                supabase_client.table("signals").update(
                    {"tinyfish_context": json.dumps(context)}
                ).eq("id", signal_id).execute()
            except Exception as e:
                logger.debug(f"[CONTEXT] Failed to persist context for {ticker}: {e}")

    except asyncio.TimeoutError:
        logger.info(f"[CONTEXT] Deep context timed out for {ticker}")
        DEEP_CONTEXT_CACHE[accession] = None
    except Exception as e:
        logger.info(f"[CONTEXT] Deep context skipped for {ticker}: {type(e).__name__}")
        DEEP_CONTEXT_CACHE[accession] = None


def get_cached_context(accession: str) -> dict:
    """Get cached deep context, or return enriching status."""
    if accession in DEEP_CONTEXT_CACHE:
        ctx = DEEP_CONTEXT_CACHE[accession]
        if ctx is None:
            return {"status": "unavailable"}
        return {"status": "ready", "context": ctx}
    return {"status": "enriching"}
