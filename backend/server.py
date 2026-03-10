# server.py — AFI Backend (FastAPI + Supabase)
# Purpose: Auth, signals, watchlist, EDGAR agent control routes
# Dependencies: fastapi, supabase, pyjwt, httpx
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

# ============ SEED SIGNALS ============
# Supabase schema: id (uuid), ticker, company, filing_type, signal, confidence, summary, accession_number, filed_at, created_at
SEED_SIGNALS = [
    {
        "ticker": "NVDA",
        "filing_type": "8-K",
        "signal": "Positive",
        "company": "NVIDIA Corporation",
        "summary": "NVIDIA discloses accelerated $10B share repurchase program; AI chip demand cited as primary driver of expanded capital return policy.",
        "confidence": 91,
        "filed_at": "2026-02-15T09:22:00Z",
        "accession_number": "seed-001",
    },
    {
        "ticker": "BA",
        "filing_type": "8-K",
        "signal": "Risk",
        "company": "The Boeing Company",
        "summary": "Boeing reports material weakness in manufacturing quality controls; FAA oversight review extended through Q2 2026 with no timeline for resolution.",
        "confidence": 88,
        "filed_at": "2026-02-15T07:45:00Z",
        "accession_number": "seed-002",
    },
    {
        "ticker": "AAPL",
        "filing_type": "8-K",
        "signal": "Positive",
        "company": "Apple Inc.",
        "summary": "Apple discloses $90B capital return program expansion; iPhone 17 pre-order volume described as 'unprecedented' in executive commentary.",
        "confidence": 85,
        "filed_at": "2026-02-15T06:30:00Z",
        "accession_number": "seed-003",
    },
    {
        "ticker": "NFLX",
        "filing_type": "8-K",
        "signal": "Risk",
        "company": "Netflix, Inc.",
        "summary": "Netflix discloses ongoing EU regulatory inquiry into algorithmic recommendation practices; potential fine up to EUR 850M disclosed.",
        "confidence": 79,
        "filed_at": "2026-02-15T04:15:00Z",
        "accession_number": "seed-004",
    },
    {
        "ticker": "MSFT",
        "filing_type": "8-K",
        "signal": "Positive",
        "company": "Microsoft Corporation",
        "summary": "Microsoft announces appointment of new Chief AI Officer; Azure AI revenue growth of 38% YoY cited alongside expanded data center commitments.",
        "confidence": 83,
        "filed_at": "2026-02-14T22:10:00Z",
        "accession_number": "seed-005",
    },
    {
        "ticker": "META",
        "filing_type": "8-K",
        "signal": "Neutral",
        "company": "Meta Platforms, Inc.",
        "summary": "Meta Platforms files updated executive compensation disclosure reflecting board-approved performance incentive adjustments for fiscal year 2025.",
        "confidence": 72,
        "filed_at": "2026-02-14T18:30:00Z",
        "accession_number": "seed-006",
    },
    {
        "ticker": "JPM",
        "filing_type": "8-K",
        "signal": "Risk",
        "company": "JPMorgan Chase & Co.",
        "summary": "JPMorgan Chase discloses unexpected $2.1B increase in credit loss provisions; commercial real estate portfolio exposure flagged as primary driver.",
        "confidence": 86,
        "filed_at": "2026-02-14T15:45:00Z",
        "accession_number": "seed-007",
    },
    {
        "ticker": "TSLA",
        "filing_type": "8-K",
        "signal": "Neutral",
        "company": "Tesla, Inc.",
        "summary": "Tesla files material agreement disclosure for new Gigafactory land acquisition in Monterrey, Mexico; production capacity and timeline undisclosed.",
        "confidence": 68,
        "filed_at": "2026-02-14T14:20:00Z",
        "accession_number": "seed-008",
    },
    {
        "ticker": "AMZN",
        "filing_type": "8-K",
        "signal": "Positive",
        "company": "Amazon.com, Inc.",
        "summary": "Amazon discloses $4B strategic investment in domestic logistics infrastructure; 15,000 new fulfillment center roles to be created across 12 states.",
        "confidence": 87,
        "filed_at": "2026-02-14T11:05:00Z",
        "accession_number": "seed-009",
    },
    {
        "ticker": "GOOGL",
        "filing_type": "8-K",
        "signal": "Risk",
        "company": "Alphabet Inc.",
        "summary": "Alphabet discloses DOJ antitrust proceedings expansion into cloud computing division; potential structural remedies including forced divestiture under review.",
        "confidence": 84,
        "filed_at": "2026-02-14T08:30:00Z",
        "accession_number": "seed-010",
    },
]

# ============ MODELS ============
class UserSignup(BaseModel):
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class WatchlistAdd(BaseModel):
    ticker: str

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
    return {
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
    }

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

# ============ HEALTH ============
@api_router.get("/")
async def root():
    return {"status": "ok", "service": "AFI API", "database": "supabase"}

# ============ SEED DATA ============
async def seed_signals():
    """Insert seed signals into Supabase if the signals table is empty."""
    try:
        result = supabase.table("signals").select("id").limit(1).execute()
        if not result.data:
            logger.info("Seeding signals table with 10 initial signals...")
            for signal in SEED_SIGNALS:
                try:
                    supabase.table("signals").insert(signal).execute()
                except Exception as e:
                    logger.warning(f"Seed signal {signal['accession_number']} may already exist: {e}")
            logger.info("Seed signals inserted successfully.")
        else:
            logger.info(f"Signals table already has records, skipping seed.")
    except Exception as e:
        logger.error(f"Failed to seed signals: {e}")

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
    await seed_signals()

@app.on_event("shutdown")
async def shutdown_event():
    global edgar_agent_instance
    if edgar_agent_instance:
        edgar_agent_instance.stop()
