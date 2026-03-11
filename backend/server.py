# server.py — AFI Backend (FastAPI + Supabase)
# Purpose: Auth, signals, watchlist, EDGAR agent control, health, telegram test, AI brief
# Dependencies: fastapi, supabase, pyjwt, httpx, google-generativeai
# Env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, CORS_ORIGINS

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
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
    }
    return result

# ============ SIGNALS ROUTES ============
@api_router.get("/signals")
async def get_signals(tickers: Optional[str] = None):
    try:
        query = supabase.table("signals").select("*").order("filed_at", desc=True)
        if tickers:
            ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
            query = query.in_("ticker", ticker_list)
        result = query.execute()
        signals = [format_signal_for_api(row) for row in (result.data or [])]
        return {"signals": signals, "total": len(signals)}
    except Exception as e:
        logger.error(f"Failed to fetch signals: {e}")
        return {"signals": [], "total": 0, "error": str(e)}

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
@api_router.get("/brief")
async def get_brief():
    """Generate a 3-sentence market intelligence brief from the latest signals."""
    try:
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
            # Fallback: generate a simple brief without AI
            positive = sum(1 for s in signals if s.get("signal") == "Positive")
            risk = sum(1 for s in signals if s.get("signal") == "Risk")
            neutral = sum(1 for s in signals if s.get("signal") == "Neutral")
            brief = f"AFI has processed {len(signals)} signals. {positive} classified as Positive, {risk} as Risk, {neutral} as Neutral. Monitor your watchlist for targeted alerts."
            return {"brief": brief, "signal_count": len(signals)}

        import google.generativeai as genai
        genai.configure(api_key=gemini_key)
        model = genai.GenerativeModel('gemini-2.5-flash')

        prompt = f"""You are a financial intelligence analyst. Given these latest SEC 8-K filing signals, write exactly 3 sentences summarizing the market intelligence. Be concise, professional, and specific. Reference company names and signal types. No bullet points, no headers, just 3 sentences.

Signals:
{context}"""

        response = model.generate_content(prompt)
        brief_text = response.text.strip()

        return {"brief": brief_text, "signal_count": len(signals)}
    except Exception as e:
        logger.error(f"Failed to generate brief: {e}")
        return {"brief": "Unable to generate market brief at this time.", "signal_count": 0}

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
