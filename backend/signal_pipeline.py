# signal_pipeline.py — Core Signal Processing Orchestrator
# Purpose: Routes filings through Classify -> Enrich -> Score -> Store -> Alert
# Uses registry pattern so new filing types plug in without modifying this file
# Dependencies: event_classifier, market_data, sentiment_analyzer, impact_engine

import logging
import os
import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class RawFiling:
    """Input to the pipeline — a filing that needs processing."""
    accession_number: str
    filing_type: str          # "8-K", "10-K", "4", etc.
    company_name: str
    entity_id: str
    filed_at: str
    filing_url: str
    filing_text: Optional[str] = None


@dataclass 
class ProcessedSignal:
    """Output from the pipeline — a fully enriched signal."""
    ticker: str
    company: str
    filing_type: str
    signal: str               # Positive / Neutral / Risk
    confidence: int
    summary: str
    accession_number: str
    filed_at: str
    # Enrichment fields
    event_type: Optional[str] = None
    filing_subtype: Optional[str] = None
    sentiment_delta: Optional[float] = None
    news_sentiment_score: Optional[float] = None
    sentiment_match: Optional[bool] = None
    impact_score: Optional[int] = None
    price_at_filing: Optional[float] = None
    config_version: Optional[int] = None


class FilingProcessor(ABC):
    """
    Base class for filing-type-specific processors.
    
    To add a new filing type:
    1. Create a new class inheriting from FilingProcessor
    2. Implement classify() method  
    3. Register with pipeline.register_processor("FILING_TYPE", YourProcessor())
    """
    
    @abstractmethod
    def classify(self, filing: RawFiling) -> dict:
        """
        Classify the filing and return a dict with:
        {ticker, company, summary, signal, confidence}
        """
        pass


class EightKProcessor(FilingProcessor):
    """Processes 8-K filings using Gemini AI classification."""
    
    SYSTEM_PROMPT = """You are a financial regulatory analyst. Given an SEC 8-K filing text, return ONLY a JSON object with no explanation:
{
  "ticker": "stock ticker or UNKNOWN",
  "company": "full company name",
  "summary": "one sentence plain English summary, max 25 words",
  "signal": "Positive or Neutral or Risk",
  "confidence": integer 0-100
}
Classify as Risk if: executive departure, litigation, debt issues, restatement, going concern.
Classify as Positive if: revenue beat, new contract, buyback, leadership upgrade.
Classify as Neutral for routine administrative filings."""
    
    def classify(self, filing: RawFiling) -> dict:
        """Classify 8-K filing with Gemini."""
        gemini_key = os.environ.get("GEMINI_API_KEY", "")
        
        if not gemini_key or gemini_key.startswith("YOUR_"):
            logger.warning("[PIPELINE] GEMINI_API_KEY missing — returning Pending")
            return {
                "ticker": "UNKNOWN",
                "company": filing.company_name,
                "summary": "Pending AI classification",
                "signal": "Pending",
                "confidence": 0,
            }
        
        try:
            import google.generativeai as genai
            genai.configure(api_key=gemini_key)
            
            model = genai.GenerativeModel('gemini-2.5-flash')
            text = filing.filing_text[:12000] if filing.filing_text else f"8-K filing by {filing.company_name}"
            prompt = f"{self.SYSTEM_PROMPT}\n\nAnalyze this SEC 8-K filing:\n\n{text}"
            
            response = model.generate_content(prompt)
            response_text = response.text.strip()
            
            # Parse JSON from response
            if response_text.startswith("```"):
                parts = response_text.split("```")
                if len(parts) >= 3:
                    response_text = parts[1]
                    if response_text.startswith("json"):
                        response_text = response_text[4:]
            
            result = json.loads(response_text.strip())
            return {
                "ticker": str(result.get("ticker", "UNKNOWN")).upper(),
                "company": str(result.get("company", filing.company_name)),
                "summary": str(result.get("summary", ""))[:200],
                "signal": result.get("signal", "Neutral") if result.get("signal") in ("Positive", "Neutral", "Risk") else "Neutral",
                "confidence": min(100, max(0, int(result.get("confidence", 50)))),
            }
        except json.JSONDecodeError as e:
            logger.error(f"[PIPELINE] Failed to parse Gemini response: {e}")
        except Exception as e:
            logger.error(f"[PIPELINE] Gemini classification error: {e}")
        
        return {
            "ticker": "UNKNOWN",
            "company": filing.company_name,
            "summary": f"AI classification failed for {filing.company_name}",
            "signal": "Pending",
            "confidence": 0,
        }


class SignalPipeline:
    """
    Central pipeline orchestrator.
    
    Routes filings through: Classify -> Enrich -> Score -> Store -> Alert
    
    Filing processors are registered by type. To add Form 4 support later:
        pipeline.register_processor("4", Form4Processor())
    No changes to the pipeline itself needed.
    """
    
    def __init__(self, supabase_client, market_data=None):
        self._processors: dict[str, FilingProcessor] = {}
        self._supabase = supabase_client
        self._config_version: int = 1
        
        # Lazy-init enrichment services
        self._market_data = market_data
        
        # Register default processors
        self.register_processor("8-K", EightKProcessor())
    
    def register_processor(self, filing_type: str, processor: FilingProcessor):
        """Register a filing processor for a specific filing type."""
        self._processors[filing_type] = processor
        logger.info(f"[PIPELINE] Registered processor for {filing_type}: {type(processor).__name__}")
    
    def set_config_version(self, version: int):
        """Update the current config version (read from agent_config)."""
        self._config_version = version
    
    def get_market_data(self):
        """Lazy-init market data service."""
        if self._market_data is None:
            from market_data import MarketDataService
            self._market_data = MarketDataService()
        return self._market_data
    
    def process(self, filing: RawFiling, watchlist_tickers: list[str] = None) -> Optional[ProcessedSignal]:
        """
        Full pipeline: Classify -> Enrich -> Score -> Store -> Alert.
        
        Returns ProcessedSignal on success, None on failure.
        """
        filing_type = filing.filing_type
        
        # Step 1: Get the right processor
        processor = self._processors.get(filing_type)
        if not processor:
            logger.warning(f"[PIPELINE] No processor for filing type: {filing_type}")
            return None
        
        # Step 2: Classify
        logger.info(f"[PIPELINE] Classifying {filing_type} filing {filing.accession_number}")
        try:
            classification = processor.classify(filing)
        except Exception as e:
            logger.error(
                f"[PIPELINE] Classification failed for {filing.accession_number} "
                f"(filing_type={filing_type}, company={filing.company_name}): {type(e).__name__}: {e}"
            )
            return ProcessedSignal(
                ticker="UNKNOWN",
                company=filing.company_name,
                filing_type=filing_type,
                signal="Pending",
                confidence=0,
                summary=f"Classification error: {type(e).__name__}",
                accession_number=filing.accession_number,
                filed_at=filing.filed_at,
                config_version=self._config_version,
            )
        
        if classification.get("signal") == "Pending":
            # Store as-is without enrichment
            return ProcessedSignal(
                ticker=classification["ticker"],
                company=classification["company"],
                filing_type=filing_type,
                signal="Pending",
                confidence=0,
                summary=classification["summary"],
                accession_number=filing.accession_number,
                filed_at=filing.filed_at,
                config_version=self._config_version,
            )
        
        # Step 3: Event classification (deterministic taxonomy)
        try:
            from event_classifier import classify_event
            event = classify_event(
                gemini_summary=classification["summary"],
                gemini_signal=classification["signal"],
                filing_text=filing.filing_text,
                filing_type=filing_type,
            )
        except Exception as e:
            logger.error(
                f"[PIPELINE] Event classification failed for {filing.accession_number} "
                f"(ticker={classification.get('ticker')}, signal={classification.get('signal')}): "
                f"{type(e).__name__}: {e}"
            )
            # Fallback: create a minimal event result
            from dataclasses import dataclass as _dc
            class _FallbackEvent:
                event_type = "ROUTINE_ADMIN"
                filing_subtype = None
                signal = classification.get("signal", "Neutral")
                confidence_adjustment = 0
            event = _FallbackEvent()
        
        # Apply confidence adjustment from event classifier
        adjusted_confidence = max(0, min(100, classification["confidence"] + event.confidence_adjustment))
        
        # Step 4: Market data enrichment
        ticker = classification["ticker"]
        price_at_filing = None
        news_headlines = []
        
        try:
            mds = self.get_market_data()
            price_at_filing = mds.get_price(ticker)
            news_items = mds.get_news_headlines(ticker, limit=5)
            news_headlines = [item.title for item in news_items]
        except Exception as e:
            logger.warning(f"[PIPELINE] Market data enrichment failed (continuing): {e}")
        
        # Step 5: Sentiment analysis
        sentiment_delta = None
        news_sentiment_score = None
        sentiment_match = None
        
        try:
            from sentiment_analyzer import analyze_sentiment
            sentiment = analyze_sentiment(
                filing_signal=event.signal,
                news_headlines=news_headlines,
            )
            sentiment_delta = sentiment.sentiment_delta
            news_sentiment_score = sentiment.news_sentiment_score
            sentiment_match = sentiment.sentiment_match
        except Exception as e:
            logger.warning(f"[PIPELINE] Sentiment analysis failed (continuing): {e}")
        
        # Step 6: Impact scoring
        impact_score = None
        try:
            from impact_engine import calculate_impact
            is_watchlist = ticker in (watchlist_tickers or [])
            impact_score = calculate_impact(
                event_type=event.event_type,
                confidence=adjusted_confidence,
                sentiment_delta=sentiment_delta or 0.0,
                is_watchlist=is_watchlist,
            )
        except Exception as e:
            logger.warning(f"[PIPELINE] Impact scoring failed (continuing): {e}")
        
        # Build final signal
        signal = ProcessedSignal(
            ticker=ticker,
            company=classification["company"],
            filing_type=filing_type,
            signal=event.signal,
            confidence=adjusted_confidence,
            summary=classification["summary"],
            accession_number=filing.accession_number,
            filed_at=filing.filed_at,
            event_type=event.event_type,
            filing_subtype=event.filing_subtype,
            sentiment_delta=sentiment_delta,
            news_sentiment_score=news_sentiment_score,
            sentiment_match=sentiment_match,
            impact_score=impact_score,
            price_at_filing=price_at_filing,
            config_version=self._config_version,
        )
        
        logger.info(
            f"[PIPELINE] Processed: {signal.ticker} | {signal.signal} | "
            f"conf={signal.confidence} | event={signal.event_type} | "
            f"impact={signal.impact_score}"
        )
        
        return signal
    
    def signal_to_db_row(self, signal: ProcessedSignal) -> dict:
        """Convert ProcessedSignal to Supabase insert dict."""
        row = {
            "ticker": signal.ticker,
            "company": signal.company,
            "filing_type": signal.filing_type,
            "signal": signal.signal,
            "confidence": signal.confidence,
            "summary": signal.summary,
            "accession_number": signal.accession_number,
            "filed_at": signal.filed_at,
        }
        # Only include enrichment fields if they have values
        if signal.event_type is not None:
            row["event_type"] = signal.event_type
        if signal.filing_subtype is not None:
            row["filing_subtype"] = signal.filing_subtype
        if signal.sentiment_delta is not None:
            row["sentiment_delta"] = signal.sentiment_delta
        if signal.news_sentiment_score is not None:
            row["news_sentiment_score"] = signal.news_sentiment_score
        if signal.sentiment_match is not None:
            row["sentiment_match"] = signal.sentiment_match
        if signal.impact_score is not None:
            row["impact_score"] = signal.impact_score
        if signal.config_version is not None:
            row["config_version_at_classification"] = signal.config_version
        return row
