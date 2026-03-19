"""
gemini_helper.py — Synchronous Gemini classification using google-genai SDK.

Uses google-genai (new SDK, not deprecated google-generativeai).
client.models.generate_content() is SYNCHRONOUS — no event loop needed.
Safe to call from EDGAR poll thread, background threads, or anywhere.

Env vars: GEMINI_API_KEY
"""
import os
import json
import re
import time
import logging
import threading

logger = logging.getLogger(__name__)

try:
    from google import genai
    from google.genai import types
    GENAI_AVAILABLE = True
except ImportError:
    genai = None
    types = None
    GENAI_AVAILABLE = False
    logger.error("[GEMINI] google-genai not installed — pip install google-genai")

# Model priority list — tried in order, stops at first working model
MODELS = [
    "gemini-2.5-flash",       # primary
    "gemini-2.5-flash-lite",  # lighter — less likely to 503
    "gemini-2.0-flash",       # stable fallback
    "gemini-2.0-flash-lite",  # last resort
]

_client = None
_model_name = None
_lock = threading.Lock()


def get_client():
    """Get working Gemini client. Thread-safe singleton — tested on first call."""
    global _client, _model_name

    if _client and _model_name:
        return _client, _model_name

    if not GENAI_AVAILABLE:
        return None, None

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        logger.error("[GEMINI] GEMINI_API_KEY not set in .env")
        return None, None

    with _lock:
        if _client and _model_name:
            return _client, _model_name

        client = genai.Client(api_key=api_key)

        for name in MODELS:
            try:
                # Pure sync connectivity test — no asyncio
                response = client.models.generate_content(
                    model=name,
                    contents="Reply: ok",
                    config=types.GenerateContentConfig(
                        max_output_tokens=5,
                        temperature=0.0,
                    ),
                )
                if response and response.text:
                    _client = client
                    _model_name = name
                    logger.info(f"[GEMINI] Model ready: {name}")
                    return _client, _model_name
            except Exception as e:
                logger.warning(f"[GEMINI] {name} unavailable: {str(e)[:80]}")

        logger.error("[GEMINI] All models failed — check GEMINI_API_KEY")
    return None, None


def classify_sync(
    prompt: str,
    ticker: str = "",
    form_type: str = "",
    max_retries: int = 3,
) -> dict | None:
    """
    PURE SYNCHRONOUS Gemini classification.

    Safe to call from:
      - Background EDGAR poll thread (Thread-2)
      - Async FastAPI handlers (non-blocking via classify_async wrapper)
      - Main thread, unit tests, anywhere

    No event loop required. Direct synchronous API call only.
    Returns parsed dict or None on total failure.
    """
    client, model_name = get_client()
    if not client:
        logger.error(f"[GEMINI] No working client for {ticker}/{form_type}")
        return None

    for attempt in range(max_retries):
        try:
            t0 = time.time()

            # ── Direct synchronous call ──────────────────────────────────────
            # New SDK: client.models.generate_content() is SYNCHRONOUS.
            # No asyncio.to_thread, no loop.run_until_complete, no await.
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.1,
                    max_output_tokens=2048,
                    response_mime_type="application/json",
                ),
            )
            # ────────────────────────────────────────────────────────────────

            ms = int((time.time() - t0) * 1000)

            if not response or not response.text:
                raise ValueError("Gemini returned empty response")

            raw = response.text.strip()
            # Strip markdown fences if present
            raw = re.sub(r'^```(?:json)?\s*', '', raw)
            raw = re.sub(r'\s*```$', '', raw).strip()

            result = json.loads(raw)

            # Sanitize signal value
            if result.get("signal") not in ("Positive", "Neutral", "Risk"):
                result["signal"] = "Neutral"

            # Sanitize confidence — never 0 for real content
            conf = result.get("confidence", 0)
            try:
                conf = int(conf)
            except (TypeError, ValueError):
                conf = 55
            result["confidence"] = max(conf, 50)
            result["gemini_model"] = model_name
            result["classification_ms"] = ms

            logger.info(
                f"[GEMINI] {ticker}/{form_type}: "
                f"{result['signal']} conf:{result['confidence']} "
                f"event:{result.get('event_type','?')} ({ms}ms) [{model_name}]"
            )
            return result

        except json.JSONDecodeError as e:
            logger.warning(f"[GEMINI] JSON parse error attempt {attempt + 1}: {e}")
            if attempt < max_retries - 1:
                time.sleep(1)

        except Exception as e:
            err = str(e)
            if "503" in err or "overloaded" in err.lower() or "unavailable" in err.lower():
                wait = 3 * (attempt + 1)  # 3s, 6s, 9s
                logger.warning(f"[GEMINI] 503 overloaded — waiting {wait}s then retrying")
                time.sleep(wait)
            elif "429" in err or "quota" in err.lower() or "rate" in err.lower():
                wait = 2 ** (attempt + 1)
                logger.warning(f"[GEMINI] Rate limited — waiting {wait}s")
                time.sleep(wait)
            elif "api_key" in err.lower() or "403" in err or "authentication" in err.lower():
                logger.error(f"[GEMINI] Auth error — check GEMINI_API_KEY: {err[:80]}")
                return None
            elif "404" in err or "not found" in err.lower():
                # Model unavailable — reset singleton and retry with next model
                logger.warning(f"[GEMINI] Model {model_name} 404 — resetting")
                global _client, _model_name
                with _lock:
                    _client = _model_name = None
                client, model_name = get_client()
                if not client:
                    return None
            else:
                logger.warning(f"[GEMINI] Attempt {attempt + 1}: {err[:80]}")
                if attempt < max_retries - 1:
                    time.sleep(2)

    logger.error(f"[GEMINI] All {max_retries} attempts failed for {ticker}/{form_type}")
    return None


def call_gemini(
    prompt: str,
    session_id: str = "classify",
    response_schema: dict = None,
) -> str:
    """
    Backward-compatible synchronous wrapper used by all processors.
    Returns raw JSON string (or empty string on failure).
    Processors parse the JSON themselves.

    Safe from any thread — delegates to new google-genai SDK internally.
    """
    client, model_name = get_client()
    if not client:
        return ""

    for attempt in range(3):
        try:
            t0 = time.time()

            config_kwargs = {
                "temperature": 0.1,
                "max_output_tokens": 2048,
            }
            if response_schema:
                config_kwargs["response_mime_type"] = "application/json"

            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(**config_kwargs),
            )
            ms = int((time.time() - t0) * 1000)
            text = (response.text or "").strip()
            if text:
                logger.info(f"[GEMINI] call_gemini OK ({ms}ms) model={model_name}")
                return text

        except Exception as e:
            err = str(e)
            if "503" in err or "overloaded" in err.lower() or "unavailable" in err.lower():
                wait = 3 * (attempt + 1)
                logger.warning(f"[GEMINI] 503 overloaded — waiting {wait}s")
                time.sleep(wait)
            elif "response_mime_type" in err.lower() or "application/json" in err.lower():
                # Model doesn't support response_mime_type — retry without
                try:
                    response = client.models.generate_content(
                        model=model_name,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            temperature=0.1,
                            max_output_tokens=2048,
                        ),
                    )
                    text = (response.text or "").strip()
                    if text:
                        return text
                except Exception as e2:
                    logger.warning(f"[GEMINI] call_gemini fallback: {e2}")
            elif "429" in err or "quota" in err.lower() or "rate" in err.lower():
                wait = 2 ** attempt
                logger.warning(f"[GEMINI] Rate limited, waiting {wait}s")
                time.sleep(wait)
            elif "404" in err or "not found" in err.lower():
                global _client, _model_name
                with _lock:
                    _client = _model_name = None
                client, model_name = get_client()
                if not client:
                    return ""
            elif "api_key" in err.lower() or "403" in err or "authentication" in err.lower():
                logger.error(f"[GEMINI] Auth error: {err[:80]}")
                return ""
            else:
                logger.warning(f"[GEMINI] call_gemini attempt {attempt + 1}: {err[:80]}")
                if attempt < 2:
                    time.sleep(1)

    return ""


async def call_gemini_async(
    prompt: str,
    session_id: str = "classify",
    response_schema: dict = None,
) -> str:
    """
    Async wrapper for FastAPI endpoints.
    Runs the sync call in a thread pool so the event loop is never blocked.
    """
    import asyncio
    return await asyncio.to_thread(call_gemini, prompt, session_id, response_schema)


def has_api_key() -> bool:
    """Check if GEMINI_API_KEY is set and non-placeholder."""
    key = os.environ.get("GEMINI_API_KEY", "")
    return bool(key and not key.startswith("your-") and not key.startswith("YOUR_"))


def get_model_name() -> str:
    """Return the currently active model name."""
    _, name = get_client()
    return name or "none"


# ─────────────────────────────────────────────────────────────────────────────
# KEYWORD CLASSIFIER — deterministic fallback when Gemini is unavailable
# ─────────────────────────────────────────────────────────────────────────────

_POSITIVE_KW = [
    ("beat consensus", 3), ("exceeded expectations", 3),
    ("record revenue", 3), ("raised guidance", 3),
    ("increased dividend", 2), ("share repurchase", 2),
    ("strategic partnership", 2), ("contract awarded", 2),
    ("above expectations", 2), ("strong demand", 2),
    ("revenue growth", 1), ("profitable", 1),
]

_RISK_KW = [
    ("missed consensus", 3), ("below expectations", 3),
    ("lowered guidance", 3), ("material weakness", 3),
    ("going concern", 3), ("sec investigation", 3),
    ("restatement", 3), ("late filing", 2),
    ("executive resignation", 2), ("terminated", 2),
    ("revenue declined", 2), ("net loss", 1),
]


def keyword_classify(text: str, ticker: str, form_type: str) -> dict:
    """
    Rule-based classifier. Used only when Gemini is unavailable.
    NT forms are always Risk/82. Real text floors confidence at 55.
    """
    t = (text or "").lower()

    if form_type in ("NT 10-K", "NT 10-Q"):
        return {
            "signal": "Risk",
            "confidence": 82,
            "event_type": "LATE_FILING",
            "summary": f"{ticker} filed late filing notice ({form_type})",
            "why_it_matters": "Late filing often signals accounting issues.",
            "market_impact": "Typically negative — investors penalize disclosure delays.",
            "key_facts": [f"Form: {form_type}", "Filing deadline missed"],
            "risk_factors": ["Potential accounting irregularities"],
            "classification_method": "rule_based",
        }

    pos = sum(w for kw, w in _POSITIVE_KW if kw in t)
    neg = sum(w for kw, w in _RISK_KW if kw in t)

    if pos > neg:
        signal, conf, event = "Positive", min(50 + pos * 5, 72), "OTHER"
    elif neg > pos:
        signal, conf, event = "Risk", min(50 + neg * 5, 72), "OTHER"
    else:
        signal, conf, event = "Neutral", 45, "ROUTINE_FILING"

    if text and len(text.strip()) > 300 and conf < 50:
        conf = 55

    return {
        "signal": signal,
        "confidence": conf,
        "event_type": event,
        "summary": f"{ticker} {form_type} filing — keyword analysis.",
        "why_it_matters": "AI classification unavailable — review directly.",
        "market_impact": "Impact unclear without full AI analysis.",
        "key_facts": [f"Form: {form_type}"],
        "risk_factors": [],
        "classification_method": "rule_based",
    }


def ensure_confidence_floor(result: dict, text: str) -> dict:
    """Floor confidence at 55 when text has real content. Never returns 0."""
    conf = result.get("confidence", 0)
    if text and len(text.strip()) > 300 and conf < 50:
        result["confidence"] = 55
        logger.warning(f"[GEMINI] Confidence floored {conf}→55 (text present, AI returned low)")
    return result
