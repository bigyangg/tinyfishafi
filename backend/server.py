# server.py — AFI Backend (FastAPI + Supabase)
# Purpose: Auth, signals, watchlist, EDGAR agent control, health, telegram test, AI brief, SSE logs
# Dependencies: fastapi, supabase, pyjwt, httpx, google-generativeai
# Env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, CORS_ORIGINS

import asyncio
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from supabase import create_client, Client
import os
import logging
from pathlib import Path
from pydantic import BaseModel, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import json
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ============ SUPABASE CLIENT ============
SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_ANON_KEY = os.environ['SUPABASE_ANON_KEY']
SUPABASE_SERVICE_ROLE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']

# Service role client for backend operations (bypasses RLS)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
# Anon client for auth operations
supabase_auth_client: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============ MODELS ============
class UserSignup(BaseModel):
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class WatchlistAdd(BaseModel):
    ticker: str

class SignalCorrection(BaseModel):
    correction: str  # "Positive" / "Neutral" / "Risk"

class ConfigUpdate(BaseModel):
    tier1_tickers: Optional[List[str]] = None
    tier2_sectors: Optional[List[str]] = None
    settings: Optional[dict] = None

# ============ AUTH HELPERS ============
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        token = credentials.credentials
        user_response = supabase.auth.get_user(token)
        user = user_response.user
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"user_id": user.id, "email": user.email}
    except Exception as e:
        error_msg = str(e).lower()
        if "401" in error_msg or "invalid" in error_msg or "expired" in error_msg:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")

# ============ AUTH ROUTES ============
@api_router.post("/auth/signup")
async def signup(data: UserSignup):
    try:
        response = supabase.auth.admin.create_user({
            "email": data.email,
            "password": data.password,
            "email_confirm": True,
        })
        user = response.user
        if not user:
            raise HTTPException(status_code=400, detail="Failed to create user")
        
        # Sign in to get a session token
        sign_in = supabase_auth_client.auth.sign_in_with_password({
            "email": data.email,
            "password": data.password,
        })
        session = sign_in.session
        return {
            "token": session.access_token,
            "user": {
                "id": user.id,
                "email": user.email,
                "tier": "retail",
            }
        }
    except Exception as e:
        error_msg = str(e)
        if "already" in error_msg.lower() or "duplicate" in error_msg.lower():
            raise HTTPException(status_code=400, detail="Email already registered")
        raise HTTPException(status_code=400, detail=f"Signup failed: {error_msg}")

@api_router.post("/auth/login")
async def login(data: UserLogin):
    try:
        response = supabase_auth_client.auth.sign_in_with_password({
            "email": data.email,
            "password": data.password,
        })
        session = response.session
        user = response.user
        if not session or not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        return {
            "token": session.access_token,
            "user": {
                "id": user.id,
                "email": user.email,
                "tier": "retail",
            }
        }
    except Exception as e:
        error_msg = str(e)
        if "invalid" in error_msg.lower() or "credentials" in error_msg.lower():
            raise HTTPException(status_code=401, detail="Invalid email or password")
        raise HTTPException(status_code=401, detail=f"Login failed: {error_msg}")

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

# ============ SIGNAL HELPERS ============
def format_signal_for_api(row):
    """Convert Supabase row to API response format (map column names)."""
    def _parse_json(val):
        if val is None:
            return None
        if isinstance(val, (dict, list)):
            return val
        try:
            return json.loads(val)
        except Exception:
            return val

    result = {
        "id": row.get("id", ""),
        "ticker": row.get("ticker", ""),
        "filing_type": row.get("filing_type", "8-K"),
        "classification": row.get("signal", "Pending"),
        "company_name": row.get("company", ""),
        "summary": row.get("summary", ""),
        "confidence": row.get("confidence", 0),
        "filed_at": row.get("filed_at", ""),
        "accession_number": row.get("accession_number", ""),
        "edgar_url": row.get("edgar_url", ""),
        # Phase 3 enrichment fields
        "event_type": row.get("event_type"),
        "filing_subtype": row.get("filing_subtype"),
        "impact_score": row.get("impact_score"),
        "sentiment_delta": row.get("sentiment_delta"),
        "sentiment_match": row.get("sentiment_match"),
        "user_correction": row.get("user_correction"),
        # Phase 6 audit trail fields
        "chain_of_thought": _parse_json(row.get("chain_of_thought")),
        "governance_audit": _parse_json(row.get("governance_audit")),
        "impact_breakdown": _parse_json(row.get("impact_breakdown")),
        "news_headlines": _parse_json(row.get("news_headlines")),
        "news_sentiment": row.get("news_sentiment"),
        "divergence_type": row.get("divergence_type"),
        "key_facts": _parse_json(row.get("key_facts")),
        "form_data": _parse_json(row.get("form_data")),
        "extraction_source": row.get("extraction_source"),
        "extraction_time_ms": row.get("extraction_time_ms"),
    }
    return result

# ============ SIGNALS ROUTES ============
@api_router.get("/signals")
async def get_signals(tickers: Optional[str] = None, limit: int = 50, offset: int = 0):
    try:
        query = supabase.table("signals").select("*").order("filed_at", desc=True).limit(limit).offset(offset)
        if tickers:
            ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
            query = query.in_("ticker", ticker_list)
        result = query.execute()
        signals = [format_signal_for_api(row) for row in (result.data or [])]
        return {"signals": signals, "total": len(signals)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/signals/{signal_id}")
async def get_signal(signal_id: str):
    """Get a single signal by ID."""
    try:
        result = supabase.table("signals").select("*").eq("id", signal_id).single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Signal not found")
        return format_signal_for_api(result.data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/signals/{signal_id}/correct")
async def correct_signal(signal_id: str, data: SignalCorrection):
    """Store user correction for a signal (feedback loop)."""
    if data.correction not in ("Positive", "Neutral", "Risk"):
        raise HTTPException(status_code=400, detail="Correction must be Positive, Neutral, or Risk")
    try:
        # Increment correction count and set correction
        existing = supabase.table("signals").select("correction_count").eq("id", signal_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Signal not found")
        
        current_count = existing.data[0].get("correction_count", 0) or 0
        supabase.table("signals").update({
            "user_correction": data.correction,
            "correction_count": current_count + 1,
        }).eq("id", signal_id).execute()
        return {"status": "corrected", "signal_id": signal_id, "correction": data.correction}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to correct signal: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/signals/{signal_id}/correlation")
async def get_signal_correlation(signal_id: str):
    """Get price correlation data for a signal."""
    try:
        result = supabase.table("price_correlations").select("*").eq("signal_id", signal_id).execute()
        if not result.data:
            return {"correlation": None}
        return {"correlation": result.data[0]}
    except Exception as e:
        logger.error(f"Failed to fetch correlation: {e}")
        return {"correlation": None, "error": str(e)}

# ============ WATCHLIST ROUTES ============
@api_router.get("/watchlist")
async def get_watchlist(current_user: dict = Depends(get_current_user)):
    try:
        result = supabase.table("watchlist").select("ticker").eq(
            "user_id", current_user["user_id"]
        ).execute()
        tickers = [row["ticker"] for row in (result.data or [])]
        return {"tickers": tickers}
    except Exception as e:
        logger.error(f"Failed to fetch watchlist: {e}")
        return {"tickers": []}

@api_router.post("/watchlist")
async def add_to_watchlist(data: WatchlistAdd, current_user: dict = Depends(get_current_user)):
    ticker = data.ticker.strip().upper()
    if not ticker or len(ticker) > 5 or not ticker.isalpha():
        raise HTTPException(status_code=400, detail="Invalid ticker symbol")
    
    result = supabase.table("watchlist").select("ticker").eq(
        "user_id", current_user["user_id"]
    ).execute()
    existing_tickers = [row["ticker"] for row in (result.data or [])]
    
    if len(existing_tickers) >= 10:
        raise HTTPException(status_code=400, detail="Watchlist limit reached (10 max)")
    if ticker in existing_tickers:
        raise HTTPException(status_code=400, detail="Ticker already in watchlist")
    
    supabase.table("watchlist").insert({
        "user_id": current_user["user_id"],
        "ticker": ticker,
    }).execute()
    
    existing_tickers.append(ticker)
    return {"tickers": existing_tickers}

@api_router.delete("/watchlist/{ticker}")
async def remove_from_watchlist(ticker: str, current_user: dict = Depends(get_current_user)):
    ticker = ticker.upper()
    supabase.table("watchlist").delete().eq(
        "user_id", current_user["user_id"]
    ).eq("ticker", ticker).execute()
    
    result = supabase.table("watchlist").select("ticker").eq(
        "user_id", current_user["user_id"]
    ).execute()
    tickers = [row["ticker"] for row in (result.data or [])]
    return {"tickers": tickers}

# ============ TICKER SEARCH PROXY ============
@api_router.get("/ticker/search")
async def ticker_search(q: str = ""):
    """Proxy Yahoo Finance symbol search to avoid CORS issues."""
    if not q or len(q) < 1:
        return {"results": []}
    try:
        import httpx
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"https://query2.finance.yahoo.com/v1/finance/search?q={q}&quotesCount=8&newsCount=0&enableFuzzyQuery=false",
                headers={"User-Agent": "Mozilla/5.0"}
            )
            data = resp.json()
            quotes = data.get("quotes", [])
            results = [
                {"ticker": quote.get("symbol", ""), "name": quote.get("shortname", quote.get("longname", "")), "exchange": quote.get("exchDisp", "")}
                for quote in quotes
                if quote.get("quoteType") in ["EQUITY", "ETF"] and quote.get("symbol")
            ]
            return {"results": results[:6]}
    except Exception:
        return {"results": []}

# ============ TINYFISH EXTRACTION STATS ============
_tf_stats = {"total": 0, "success": 0}

def record_tinyfish_call(success: bool):
    """Track TinyFish extraction call outcomes."""
    _tf_stats["total"] += 1
    if success:
        _tf_stats["success"] += 1

@api_router.get("/tinyfish/stats")
async def tinyfish_stats():
    """Return TinyFish extraction statistics."""
    t = _tf_stats["total"]
    return {
        "total_extractions": t,
        "successful": _tf_stats["success"],
        "success_rate": round(_tf_stats["success"] / max(t, 1), 2),
    }

# ============ EDGAR AGENT CONTROL ============
edgar_agent_instance = None

@api_router.get("/edgar/status")
async def edgar_status():
    if edgar_agent_instance is None:
        return {
            "agent_status": "not_initialized",
            "last_poll_time": None,
            "filings_processed_today": 0,
        }
    return edgar_agent_instance.get_status()

@api_router.post("/edgar/start")
async def edgar_start():
    global edgar_agent_instance
    if edgar_agent_instance is None:
        try:
            from edgar_agent import EdgarAgent
            edgar_agent_instance = EdgarAgent(supabase)
        except Exception as e:
            logger.error(f"Failed to initialize EDGAR agent: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to initialize EDGAR agent: {str(e)}")
    
    edgar_agent_instance.start()
    return {"status": "started", "message": "EDGAR polling agent started"}

@api_router.post("/edgar/stop")
async def edgar_stop():
    global edgar_agent_instance
    if edgar_agent_instance is None:
        return {"status": "not_running", "message": "EDGAR agent was not running"}
    edgar_agent_instance.stop()
    return {"status": "stopped", "message": "EDGAR polling agent stopped"}

# ============ MANUAL FETCH ============
class ManualFetch(BaseModel):
    ticker: str

@api_router.post("/edgar/fetch-company")
async def edgar_fetch_company(data: ManualFetch):
    global edgar_agent_instance
    if edgar_agent_instance is None:
        try:
            from edgar_agent import EdgarAgent
            edgar_agent_instance = EdgarAgent(supabase)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    result = edgar_agent_instance.fetch_company_latest(data.ticker.strip().upper())
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=result.get("message"))
    if result.get("status") == "not_found":
        raise HTTPException(status_code=404, detail=result.get("message"))
    return result

# ============ DEMO TRIGGER ============
class DemoTrigger(BaseModel):
    ticker: str

@api_router.post("/demo/trigger")
async def trigger_demo_signal(body: dict):
    """Fire real pipeline on any ticker's latest SEC filing."""
    import time
    import asyncio
    import httpx
    from signal_pipeline import SignalPipeline, RawFiling, pipeline_log

    ticker = body.get("ticker", "TSLA").upper()
    target_form = body.get("form", "8-K").upper()
    # Normalize form type names
    form_aliases = {"FORM4": "4", "FORM 4": "4", "SC13D": "SC 13D", "10K": "10-K", "10Q": "10-Q", "8K": "8-K"}
    target_form = form_aliases.get(target_form, target_form)
    
    pipeline_log("DEMO", f"Demo trigger started for {ticker} [{target_form}]")

    try:
        # Step 1: Get CIK from SEC company tickers
        async with httpx.AsyncClient() as client:
            ticker_resp = await client.get(
                "https://www.sec.gov/files/company_tickers.json",
                headers={"User-Agent": "AFI demo@afi.com"},
                timeout=10,
            )

        tickers_data = ticker_resp.json()
        cik = None
        entity_name = ticker
        for entry in tickers_data.values():
            if entry.get("ticker", "").upper() == ticker:
                cik = str(entry["cik_str"]).zfill(10)
                entity_name = entry.get("title", ticker)
                break

        if not cik:
            pipeline_log("DEMO", f"Could not resolve CIK for {ticker}", "error")
            return {"error": f"Could not resolve CIK for {ticker}"}

        pipeline_log("DEMO", f"Resolved {ticker} -> CIK {cik} ({entity_name})")

        # Step 2: Get most recent filing of target type from submissions
        async with httpx.AsyncClient() as client:
            sub_resp = await client.get(
                f"https://data.sec.gov/submissions/CIK{cik}.json",
                headers={"User-Agent": "AFI demo@afi.com"},
                timeout=10,
            )

        sub_data = sub_resp.json()
        filings = sub_data.get("filings", {}).get("recent", {})
        forms       = filings.get("form", [])
        accessions  = filings.get("accessionNumber", [])
        dates       = filings.get("filingDate", [])
        primary_docs = filings.get("primaryDocument", [])

        latest_filing = None
        for i, form in enumerate(forms):
            if form == target_form or form.startswith(target_form):
                acc_clean = accessions[i].replace("-", "")
                acc_dashes = accessions[i]
                latest_filing = {
                    "accession_clean":  acc_clean,
                    "accession_dashes": acc_dashes,
                    "date":             dates[i],
                    "cik":              str(int(cik)),
                    "primary_doc":      primary_docs[i] if i < len(primary_docs) else "",
                    "form":             form,
                }
                break

        if not latest_filing:
            pipeline_log("DEMO", f"No {target_form} filings found for {ticker}", "error")
            return {"error": f"No {target_form} filings found for {ticker}"}

        # Step 3: Build filing URL and fetch text
        cik_clean = str(int(cik))
        filing_url = (
            f"https://www.sec.gov/Archives/edgar/data/"
            f"{cik_clean}/{latest_filing['accession_clean']}/"
            f"{latest_filing['accession_dashes']}-index.htm"
        )
        
        # Try to fetch filing text
        filing_text = None
        if latest_filing["primary_doc"]:
            doc_url = (
                f"https://www.sec.gov/Archives/edgar/data/"
                f"{cik_clean}/{latest_filing['accession_clean']}/"
                f"{latest_filing['primary_doc']}"
            )
            try:
                async with httpx.AsyncClient() as client:
                    doc_resp = await client.get(
                        doc_url,
                        headers={"User-Agent": "AFI demo@afi.com"},
                        timeout=15,
                    )
                if doc_resp.status_code == 200:
                    filing_text = doc_resp.text[:15000]
                    pipeline_log("TINYFISH", f"Fetched {len(filing_text)} chars of {target_form} text")
            except Exception:
                pipeline_log("TINYFISH", "Could not fetch filing text, proceeding with metadata only", "warning")

        actual_form = latest_filing["form"]
        pipeline_log("DEMO", f"Found {actual_form} filed {latest_filing['date']}: {filing_url}")

        # Step 4: Run REAL pipeline
        demo_accession = f"demo_{latest_filing['accession_dashes']}_{int(time.time())}"

        raw_filing = RawFiling(
            accession_number=demo_accession,
            filing_type=actual_form,
            company_name=entity_name,
            entity_id=cik_clean,
            filed_at=latest_filing["date"] + "T09:00:00Z",
            filing_url=filing_url,
            filing_text=filing_text,
        )

        # Process in background thread so endpoint returns immediately
        async def _run_pipeline():
            try:
                pipe = SignalPipeline(supabase)
                signal = pipe.process(raw_filing)
                if signal:
                    row = pipe.signal_to_db_row(signal)
                    supabase.table("signals").insert(row).execute()
                    pipeline_log("PIPELINE", f"Demo signal stored: {signal.ticker} [{signal.signal}]", "success")
                else:
                    pipeline_log("PIPELINE", f"Pipeline returned no signal for {ticker}", "warning")
            except Exception as e:
                pipeline_log("PIPELINE", f"Demo pipeline error: {e}", "error")

        asyncio.create_task(_run_pipeline())

        return {
            "status":      "triggered",
            "ticker":      ticker,
            "company":     entity_name,
            "filing_date": latest_filing["date"],
            "filing_url":  filing_url,
            "message":     f"Pipeline running for {ticker}. Signal appears in ~30s.",
        }

    except Exception as e:
        pipeline_log("DEMO", f"Demo trigger failed: {e}", "error")
        return {"error": str(e)}


@api_router.post("/demo/trigger-all")
async def trigger_all_forms(body: dict):
    """Smart demo: run ALL filing types for a ticker in one click."""
    import time
    import asyncio
    import httpx
    from signal_pipeline import SignalPipeline, RawFiling, pipeline_log

    ticker = body.get("ticker", "TSLA").upper()
    ALL_FORMS = ["8-K", "10-K", "10-Q", "4", "SC 13D"]

    pipeline_log("DEMO", f"Smart trigger started for {ticker} — scanning all {len(ALL_FORMS)} form types")

    try:
        # Step 1: Resolve CIK
        async with httpx.AsyncClient() as client:
            ticker_resp = await client.get(
                "https://www.sec.gov/files/company_tickers.json",
                headers={"User-Agent": "AFI demo@afi.com"},
                timeout=10,
            )
        tickers_data = ticker_resp.json()
        cik = None
        entity_name = ticker
        for entry in tickers_data.values():
            if entry.get("ticker", "").upper() == ticker:
                cik = str(entry["cik_str"]).zfill(10)
                entity_name = entry.get("title", ticker)
                break

        if not cik:
            pipeline_log("DEMO", f"Could not resolve CIK for {ticker}", "error")
            return {"error": f"Could not resolve CIK for {ticker}"}

        pipeline_log("DEMO", f"Resolved {ticker} -> CIK {cik} ({entity_name})")

        # Step 2: Fetch submissions
        async with httpx.AsyncClient() as client:
            sub_resp = await client.get(
                f"https://data.sec.gov/submissions/CIK{cik}.json",
                headers={"User-Agent": "AFI demo@afi.com"},
                timeout=10,
            )
        sub_data = sub_resp.json()
        filings = sub_data.get("filings", {}).get("recent", {})
        forms_list    = filings.get("form", [])
        accessions    = filings.get("accessionNumber", [])
        dates         = filings.get("filingDate", [])
        primary_docs  = filings.get("primaryDocument", [])

        # Step 3: Find latest of each form type
        found_forms = {}
        for target_form in ALL_FORMS:
            for i, form in enumerate(forms_list):
                if form == target_form or form.startswith(target_form):
                    if target_form not in found_forms:
                        found_forms[target_form] = {
                            "accession_clean":  accessions[i].replace("-", ""),
                            "accession_dashes": accessions[i],
                            "date":             dates[i],
                            "cik":              str(int(cik)),
                            "primary_doc":      primary_docs[i] if i < len(primary_docs) else "",
                            "form":             form,
                        }
                        break

        pipeline_log("DEMO", f"Found {len(found_forms)}/{len(ALL_FORMS)} form types: {', '.join(found_forms.keys())}")

        # Step 4: Process each form type in background
        cik_clean = str(int(cik))
        results = []

        async def _process_form(form_key, filing_info):
            try:
                actual_form = filing_info["form"]
                pipeline_log("DEMO", f"[{ticker}] Processing {actual_form} filed {filing_info['date']}...")

                filing_url = (
                    f"https://www.sec.gov/Archives/edgar/data/"
                    f"{cik_clean}/{filing_info['accession_clean']}/"
                    f"{filing_info['accession_dashes']}-index.htm"
                )

                # Fetch text
                filing_text = None
                if filing_info["primary_doc"]:
                    doc_url = (
                        f"https://www.sec.gov/Archives/edgar/data/"
                        f"{cik_clean}/{filing_info['accession_clean']}/"
                        f"{filing_info['primary_doc']}"
                    )
                    try:
                        async with httpx.AsyncClient() as client:
                            doc_resp = await client.get(
                                doc_url,
                                headers={"User-Agent": "AFI demo@afi.com"},
                                timeout=15,
                            )
                        if doc_resp.status_code == 200:
                            filing_text = doc_resp.text[:15000]
                            pipeline_log("TINYFISH", f"[{ticker}/{actual_form}] Fetched {len(filing_text)} chars")
                    except Exception:
                        pipeline_log("TINYFISH", f"[{ticker}/{actual_form}] Could not fetch text", "warning")

                demo_accession = f"demo_{filing_info['accession_dashes']}_{int(time.time())}"

                raw_filing = RawFiling(
                    accession_number=demo_accession,
                    filing_type=actual_form,
                    company_name=entity_name,
                    entity_id=cik_clean,
                    filed_at=filing_info["date"] + "T09:00:00Z",
                    filing_url=filing_url,
                    filing_text=filing_text,
                )

                pipeline_log("PIPELINE", f"[{ticker}/{actual_form}] Classifying with Gemini...")
                pipe = SignalPipeline(supabase)
                signal = pipe.process(raw_filing)

                if signal:
                    row = pipe.signal_to_db_row(signal)
                    supabase.table("signals").insert(row).execute()
                    pipeline_log("PIPELINE", f"[{ticker}/{actual_form}] {signal.signal} (conf {signal.confidence}) — {signal.summary[:60]}", "success")
                    return {"form": actual_form, "signal": signal.signal, "confidence": signal.confidence, "event_type": signal.event_type}
                else:
                    pipeline_log("PIPELINE", f"[{ticker}/{actual_form}] No signal produced", "warning")
                    return {"form": actual_form, "signal": None}

            except Exception as e:
                pipeline_log("PIPELINE", f"[{ticker}/{form_key}] Error: {e}", "error")
                return {"form": form_key, "error": str(e)}

        async def _run_all():
            from telegram_bot import send_telegram_alert
            for form_key, filing_info in found_forms.items():
                result = await _process_form(form_key, filing_info)
                results.append(result)
                
                # Push notification to TG for demo events if a signal was found
                if result.get("signal"):
                    try:
                        pipeline_log("DEMO", f"[{ticker}] Pushing to Telegram...")
                        # Fetch the completed signal from DB to pass to the bot
                        resp = supabase.table("signals").select("*").eq("ticker", ticker).eq("classification", result["signal"]).order("created_at", desc=True).limit(1).execute()
                        if resp.data:
                            # Use existing should_alert wrapper logic
                            await send_telegram_alert(resp.data[0])
                    except Exception as e:
                        pipeline_log("DEMO", f"[{ticker}] Telegram push failed: {e}", "warning")
                        
            pipeline_log("DEMO", f"[{ticker}] All done — {len(results)} forms processed", "success")

        asyncio.create_task(_run_all())

        return {
            "status":     "triggered",
            "ticker":     ticker,
            "company":    entity_name,
            "forms_found": list(found_forms.keys()),
            "message":    f"Processing {len(found_forms)} form types for {ticker}. Watch the pipeline logs.",
        }

    except Exception as e:
        pipeline_log("DEMO", f"Smart trigger failed: {e}", "error")
        return {"error": str(e)}

# ============ SSE LOG STREAM ============
log_queue = asyncio.Queue()

@api_router.get("/logs/stream")
async def stream_logs():
    """Server-Sent Events endpoint for live pipeline logs."""
    async def generate():
        while True:
            try:
                entry = await asyncio.wait_for(log_queue.get(), timeout=30)
                yield f"data: {json.dumps(entry)}\n\n"
            except asyncio.TimeoutError:
                yield f"data: {json.dumps({'type': 'ping'})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")

# ============ AGENT CONFIG ============
@api_router.get("/config")
async def get_config():
    """Get current agent configuration."""
    try:
        result = supabase.table("agent_config").select("*").limit(1).execute()
        if not result.data:
            return {"config": None}
        config = result.data[0]
        return {
            "config_version": config.get("config_version", 1),
            "tier1_tickers": config.get("tier1_tickers", []),
            "tier2_sectors": config.get("tier2_sectors", []),
            "pending_promotions": config.get("pending_promotions", []),
            "settings": config.get("settings", {}),
        }
    except Exception as e:
        logger.error(f"Failed to fetch config: {e}")
        return {"config": None, "error": str(e)}

@api_router.post("/config")
async def update_config(data: ConfigUpdate):
    """Update agent configuration (increments version)."""
    try:
        result = supabase.table("agent_config").select("*").limit(1).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="No config found")

        current = result.data[0]
        update = {"config_version": current.get("config_version", 1) + 1}
        
        if data.tier1_tickers is not None:
            update["tier1_tickers"] = data.tier1_tickers
        if data.tier2_sectors is not None:
            update["tier2_sectors"] = data.tier2_sectors
        if data.settings is not None:
            update["settings"] = data.settings
        
        supabase.table("agent_config").update(update).eq("id", current["id"]).execute()
        return {"status": "updated", "config_version": update["config_version"]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update config: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============ HEALTH CHECK ============
@api_router.get("/health")
async def health_check():
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "service": "AFI API",
        "database": "supabase",
        "agent": edgar_agent_instance.get_status() if edgar_agent_instance else {"agent_status": "not_initialized"},
    }

@api_router.get("/")
async def root():
    return {"status": "ok", "service": "AFI API", "database": "supabase"}

# ============ TELEGRAM TEST ============
@api_router.post("/telegram/test")
async def telegram_test():
    try:
        from telegram_bot import send_test_message
        success = send_test_message()
        if success:
            return {"status": "sent", "message": "Test message sent to Telegram"}
        else:
            return {"status": "failed", "message": "Telegram is disabled or misconfigured"}
    except Exception as e:
        logger.error(f"Telegram test failed: {e}")
        return {"status": "error", "message": str(e)}

# ============ AI BRIEF ============
_brief_cache = {"text": None, "timestamp": 0, "signal_count": 0}
BRIEF_TTL = 300  # 5 minutes

@api_router.get("/brief")
async def get_brief():
    """Generate a 3-sentence market intelligence brief from the latest signals (cached)."""
    global _brief_cache
    import time as _time

    try:
        # Get current signal count to detect new signals
        count_result = supabase.table("signals").select("id", count="exact").limit(1).execute()
        current_count = len(supabase.table("signals").select("id").execute().data or [])

        now = _time.time()
        cache_valid = (
            _brief_cache["text"] is not None
            and (now - _brief_cache["timestamp"]) < BRIEF_TTL
            and _brief_cache["signal_count"] == current_count
        )

        if cache_valid:
            return {"brief": _brief_cache["text"], "signal_count": current_count, "cached": True}

        # Cache miss — generate fresh
        result = supabase.table("signals").select("*").order("filed_at", desc=True).limit(10).execute()
        signals = result.data or []

        if not signals:
            return {"brief": "No signals have been processed yet. The EDGAR agent is monitoring for new 8-K filings.", "signal_count": 0}

        # Build context for Gemini
        signal_summaries = []
        for s in signals:
            signal_summaries.append(f"{s.get('ticker','?')} ({s.get('signal','?')}, {s.get('confidence',0)}%): {s.get('summary','')}")
        context = "\n".join(signal_summaries)

        gemini_key = os.environ.get("GEMINI_API_KEY", "")
        if not gemini_key or gemini_key.startswith("YOUR_"):
            positive = sum(1 for s in signals if s.get("signal") == "Positive")
            risk = sum(1 for s in signals if s.get("signal") == "Risk")
            neutral = sum(1 for s in signals if s.get("signal") == "Neutral")
            brief = f"AFI has processed {len(signals)} signals. {positive} classified as Positive, {risk} as Risk, {neutral} as Neutral. Monitor your watchlist for targeted alerts."
            _brief_cache = {"text": brief, "timestamp": now, "signal_count": current_count}
            return {"brief": brief, "signal_count": len(signals)}

        import google.generativeai as genai
        genai.configure(api_key=gemini_key)
        model = genai.GenerativeModel('gemini-2.5-flash')

        prompt = f"""You are a financial intelligence analyst. Given these latest SEC 8-K filing signals, write exactly 3 sentences summarizing the market intelligence. Be concise, professional, and specific. Reference company names and signal types. No bullet points, no headers, just 3 sentences.

Signals:
{context}"""

        response = model.generate_content(prompt)
        brief_text = response.text.strip()

        _brief_cache = {"text": brief_text, "timestamp": now, "signal_count": current_count}
        return {"brief": brief_text, "signal_count": len(signals), "cached": False}
    except Exception as e:
        logger.error(f"Failed to generate brief: {e}")
        # Return stale cache if available
        if _brief_cache["text"]:
            return {"brief": _brief_cache["text"], "signal_count": 0, "cached": True, "stale": True}
        return {"brief": "Unable to generate market brief at this time.", "signal_count": 0}

# ============ DAILY DIGEST ============
@api_router.post("/digest/send")
async def send_daily_digest():
    """Send daily digest of top signals. Call via cron at 4PM EST."""
    from datetime import datetime as _dt, timezone as _tz
    today = _dt.now(_tz.utc).date().isoformat()

    result = supabase.table("signals")\
        .select("*")\
        .gte("filed_at", f"{today}T00:00:00")\
        .order("impact_score", desc=True)\
        .limit(10)\
        .execute()

    signals = result.data or []
    if not signals:
        return {"sent": 0, "reason": "No signals today"}

    # Build HTML rows
    rows_html = ""
    for s in signals[:5]:
        sig_color = {"Positive": "#00C805", "Risk": "#FF3333"}.get(s.get("signal", ""), "#666")
        summary_text = (s.get("summary") or "")[:80]
        rows_html += (
            f'<tr>'
            f'<td style="font-family:monospace;font-weight:700;padding:8px 12px;border-bottom:1px solid #111;color:#fff;">{s.get("ticker","?")}</td>'
            f'<td style="color:{sig_color};font-family:monospace;padding:8px 12px;border-bottom:1px solid #111;">{s.get("signal","?")}</td>'
            f'<td style="color:#666;padding:8px 12px;border-bottom:1px solid #111;font-size:13px;">{summary_text}...</td>'
            f'<td style="font-family:monospace;color:#444;padding:8px 12px;border-bottom:1px solid #111;">{s.get("impact_score",0)}/100</td>'
            f'</tr>'
        )

    email_html = (
        f'<div style="background:#050505;color:#fff;padding:32px;font-family:sans-serif;max-width:600px;">'
        f'<h2 style="font-family:monospace;color:#fff;letter-spacing:0.1em;font-size:14px;margin-bottom:4px;">AFI DAILY DIGEST</h2>'
        f'<p style="color:#333;font-size:12px;font-family:monospace;margin-bottom:24px;">{today} &mdash; {len(signals)} filings processed</p>'
        f'<table style="width:100%;border-collapse:collapse;border:1px solid #111;">'
        f'<thead><tr style="background:#0a0a0a;">'
        f'<th style="font-family:monospace;font-size:10px;color:#333;padding:8px 12px;text-align:left;letter-spacing:0.1em;">TICKER</th>'
        f'<th style="font-family:monospace;font-size:10px;color:#333;padding:8px 12px;text-align:left;letter-spacing:0.1em;">SIGNAL</th>'
        f'<th style="font-family:monospace;font-size:10px;color:#333;padding:8px 12px;text-align:left;letter-spacing:0.1em;">SUMMARY</th>'
        f'<th style="font-family:monospace;font-size:10px;color:#333;padding:8px 12px;text-align:left;letter-spacing:0.1em;">IMPACT</th>'
        f'</tr></thead>'
        f'<tbody>{rows_html}</tbody></table>'
        f'<div style="margin-top:24px;padding-top:16px;border-top:1px solid #111;">'
        f'<a href="{os.environ.get("FRONTEND_URL", "http://localhost:3000")}/dashboard" '
        f'style="font-family:monospace;font-size:11px;color:#0066FF;text-decoration:none;letter-spacing:0.06em;">'
        f'VIEW FULL DASHBOARD &rarr;</a></div></div>'
    )

    resend_key = os.environ.get("RESEND_API_KEY", "")
    digest_email = os.environ.get("DIGEST_EMAIL", "")
    if resend_key and digest_email:
        try:
            import resend
            resend.api_key = resend_key
            resend.Emails.send({
                "from": "AFI <alerts@afi.dev>",
                "to": [digest_email],
                "subject": f"AFI Daily Digest - {len(signals)} signals | {today}",
                "html": email_html,
            })
            return {"sent": 1, "signals": len(signals)}
        except Exception as e:
            logger.error(f"[DIGEST] Resend failed: {e}")
            return {"sent": 0, "error": str(e), "html_preview": email_html}

    return {"sent": 0, "reason": "RESEND_API_KEY not configured", "signals": len(signals), "html_preview": email_html}

# ============ SEED CLEANUP ============
async def cleanup_seed_data():
    """Remove seed signals (accession_number starting with 'seed-') from Supabase."""
    try:
        result = supabase.table("signals").select("id, accession_number").like(
            "accession_number", "seed-%"
        ).execute()
        seed_rows = result.data or []
        if seed_rows:
            logger.info(f"Removing {len(seed_rows)} seed signals from database...")
            for row in seed_rows:
                try:
                    supabase.table("signals").delete().eq("id", row["id"]).execute()
                except Exception as e:
                    logger.warning(f"Failed to delete seed signal {row['id']}: {e}")
            logger.info("Seed data cleanup complete.")
        else:
            logger.info("No seed data found in signals table.")
    except Exception as e:
        logger.error(f"Seed cleanup error: {e}")

# ============ APP SETUP ============
app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    global edgar_agent_instance

    # Step 0: Wire up SSE log queue to pipeline
    try:
        from signal_pipeline import set_log_queue
        set_log_queue(log_queue)
        logger.info("SSE log queue connected to pipeline")
    except Exception as e:
        logger.warning(f"Failed to connect SSE log queue: {e}")

    # Step 1: Clean seed data
    await cleanup_seed_data()

    # Step 2: Auto-start EDGAR agent (pipeline + price tracker init inside)
    try:
        from edgar_agent import EdgarAgent
        edgar_agent_instance = EdgarAgent(supabase)
        edgar_agent_instance.start()
        logger.info("EDGAR agent auto-started on server boot (pipeline + price tracker)")
    except Exception as e:
        logger.error(f"Failed to auto-start EDGAR agent: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    global edgar_agent_instance
    if edgar_agent_instance:
        edgar_agent_instance.stop()
