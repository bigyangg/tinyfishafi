# signal_pipeline.py — Core Signal Processing Orchestrator
# Purpose: Routes filings through Classify -> Enrich -> Govern -> Score -> Store -> Alert
# Uses registry pattern so new filing types plug in without modifying this file
# Dependencies: event_classifier, market_data, sentiment_analyzer, impact_engine, governance

import logging
import os
import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

JUNK_PATTERNS = [
    "no matching ticker",
    "not an 8-k filing",
    "no filing content was found",
    "system message",
    "cannot analyze",
    "unable to provide",
    "provided text indicates",
]

def is_valid_signal(ticker: str, summary: str) -> bool:
    if not ticker or ticker == "UNKNOWN":
        return False
    summary_lower = (summary or "").lower()
    return not any(p in summary_lower for p in JUNK_PATTERNS)


# ── Pipeline log emitter (sends to SSE queue if available) ──

_log_queue = None
_log_history_callback = None

def set_log_queue(queue):
    """Set the asyncio.Queue used for SSE log streaming."""
    global _log_queue
    _log_queue = queue

def set_log_history_callback(cb):
    """Callback triggered per log entry to persist into server.py memory."""
    global _log_history_callback
    _log_history_callback = cb

def pipeline_log(step: str, message: str, level: str = "info", run_id: str = None):
    """Emit a log entry to both Python logging and the SSE stream."""
    log_fn = {"success": logger.info, "warning": logger.warning, "error": logger.error}.get(level, logger.info)
    log_fn(f"[{step}] {message}")
    
    entry = {
        "time": datetime.utcnow().strftime("%H:%M:%S"),
        "step": step,
        "message": message,
        "level": level,
    }
    if run_id:
        entry["run_id"] = run_id
        
    if _log_history_callback:
        try:
            _log_history_callback(run_id, entry)
        except Exception:
            pass

    if _log_queue is not None:
        try:
            _log_queue.put_nowait(entry)
        except Exception:
            pass  # never crash pipeline for logging


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
    # New: chain of thought + governance
    chain_of_thought: Optional[dict] = None
    key_facts: Optional[list] = None
    form_data: Optional[dict] = None
    governance_audit: Optional[list] = None
    impact_breakdown: Optional[dict] = None
    news_headlines: Optional[list] = None
    news_sentiment: Optional[str] = None
    divergence_type: Optional[str] = None
    extraction_source: Optional[str] = None
    extraction_time_ms: Optional[int] = None
    run_id: Optional[str] = None


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
        Optional: chain_of_thought, key_facts, form_data
        """
        pass


class SignalPipeline:
    """
    Central pipeline orchestrator.
    
    Routes filings through: Classify -> Enrich -> Govern -> Score -> Store -> Alert
    
    Filing processors are registered by type:
        pipeline.register_processor("8-K", Form8KProcessor())
        pipeline.register_processor("10-K", Form10KProcessor())
        pipeline.register_processor("4", Form4Processor())
    """
    
    def __init__(self, supabase_client, market_data=None):
        self._processors: dict[str, FilingProcessor] = {}
        self._supabase = supabase_client
        self._config_version: int = 1
        
        # Lazy-init enrichment services
        self._market_data = market_data
        
        # Register all processors
        self._register_default_processors()
    
    def _register_default_processors(self):
        """Register all form-type processors."""
        try:
            from processors.form_8k import Form8KProcessor
            self.register_processor("8-K", Form8KProcessor())
        except Exception as e:
            logger.error(f"[PIPELINE] Failed to register 8-K processor: {e}")

        try:
            from processors.form_10k import Form10KProcessor
            self.register_processor("10-K", Form10KProcessor())
        except Exception as e:
            logger.error(f"[PIPELINE] Failed to register 10-K processor: {e}")

        try:
            from processors.form_10q import Form10QProcessor
            self.register_processor("10-Q", Form10QProcessor())
        except Exception as e:
            logger.error(f"[PIPELINE] Failed to register 10-Q processor: {e}")

        try:
            from processors.form_4 import Form4Processor
            self.register_processor("4", Form4Processor())
        except Exception as e:
            logger.error(f"[PIPELINE] Failed to register Form 4 processor: {e}")

        try:
            from processors.form_sc13d import FormSC13DProcessor
            self.register_processor("SC 13D", FormSC13DProcessor())
        except Exception as e:
            logger.error(f"[PIPELINE] Failed to register SC 13D processor: {e}")

        try:
            from processors.form_s1 import FormS1Processor
            self.register_processor("S-1", FormS1Processor())
            self.register_processor("S-1/A", FormS1Processor())
        except Exception as e:
            logger.error(f"[PIPELINE] Failed to register S-1 processor: {e}")
    
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
    
    def process(self, filing: RawFiling, watchlist_tickers: list[str] = None, run_id: str = None) -> Optional[ProcessedSignal]:
        """
        Full pipeline: Classify -> Enrich -> Govern -> Score -> Store -> Alert.
        
        Returns ProcessedSignal on success, None on failure.
        """
        import time
        pipeline_start = time.time()
        filing_type = filing.filing_type
        
        # Step 1: Get the right processor
        processor = self._processors.get(filing_type)
        if not processor:
            logger.warning(f"[PIPELINE] No processor for filing type: {filing_type}")
            pipeline_log("PIPELINE", f"No processor for filing type: {filing_type}", "warning")
            return None
        
        # Step 2: Classify
        pipeline_log("GEMINI", f"Classifying {filing_type} filing...")
        logger.info(f"[PIPELINE] Classifying {filing_type} filing {filing.accession_number}")
        try:
            classification = processor.classify(filing)
        except Exception as e:
            logger.error(
                f"[PIPELINE] Classification failed for {filing.accession_number} "
                f"(filing_type={filing_type}, company={filing.company_name}): {type(e).__name__}: {e}"
            )
            pipeline_log("GEMINI", f"Classification failed: {type(e).__name__}", "error")
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
        
        pipeline_log("GEMINI", f"Signal: {classification.get('signal')}, conf: {classification.get('confidence')}", "success")
        
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
            
        if not is_valid_signal(classification.get("ticker", ""), classification.get("summary", "")):
            logger.warning(f"[PIPELINE] Discarding junk signal: {classification.get('summary', '')[:60]}")
            return None
        
        # Extract chain of thought + key facts from classification
        chain_of_thought = classification.get("chain_of_thought")
        key_facts = classification.get("key_facts", [])
        form_data = classification.get("form_data")
        
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
        pipeline_log("NEWS", f"Analyzing sentiment for {ticker}...")
        sentiment_delta = None
        news_sentiment_score = None
        sentiment_match = None
        news_sentiment_label = None
        
        try:
            from sentiment_analyzer import analyze_sentiment
            sentiment = analyze_sentiment(
                filing_signal=event.signal,
                news_headlines=news_headlines,
            )
            sentiment_delta = sentiment.sentiment_delta
            news_sentiment_score = sentiment.news_sentiment_score
            sentiment_match = sentiment.sentiment_match
            # Derive label from score
            if news_sentiment_score is not None:
                if news_sentiment_score > 0.2:
                    news_sentiment_label = "Positive"
                elif news_sentiment_score < -0.2:
                    news_sentiment_label = "Risk"
                else:
                    news_sentiment_label = "Neutral"
            pipeline_log("NEWS", f"{len(news_headlines)} headlines, sentiment: {news_sentiment_label or 'N/A'}", "success")
        except Exception as e:
            logger.warning(f"[PIPELINE] Sentiment analysis failed (continuing): {e}")
            pipeline_log("NEWS", f"Sentiment analysis failed: {e}", "warning")
        
        # Step 6: Governance checks
        pipeline_log("GOVERNANCE", "Running 5 checks...")
        governance_audit = []
        divergence_type = None
        try:
            from governance import run_governance
            gov_data = {
                "signal": event.signal,
                "confidence": adjusted_confidence,
                "event_type": event.event_type,
                "summary": classification["summary"],
                "key_facts": key_facts,
            }
            news_gov_data = {
                "news_sentiment": news_sentiment_label,
                "sentiment_match": sentiment_match,
            }
            gov_result, governance_audit = run_governance(gov_data, news_gov_data)
            
            # Apply governance modifications
            adjusted_confidence = gov_result.get("confidence", adjusted_confidence)
            if gov_result.get("event_type"):
                event.event_type = gov_result["event_type"]
            divergence_type = gov_result.get("divergence_type")
            
            # If junk filter rejected, discard
            if gov_result.get("_rejected"):
                pipeline_log("GOVERNANCE", "Signal REJECTED by junk filter", "warning")
                return None
            
            passed = sum(1 for a in governance_audit if a.get("passed"))
            pipeline_log("GOVERNANCE", f"{passed}/5 passed", "success" if passed == 5 else "warning")
        except Exception as e:
            logger.warning(f"[PIPELINE] Governance checks failed (continuing): {e}")
            pipeline_log("GOVERNANCE", f"Governance failed: {e}", "warning")
        
        # Step 7: Impact scoring
        impact_score = None
        impact_breakdown = None
        try:
            from impact_engine import calculate_impact
            is_watchlist = ticker in (watchlist_tickers or [])
            impact_score = calculate_impact(
                event_type=event.event_type,
                confidence=adjusted_confidence,
                sentiment_delta=sentiment_delta or 0.0,
                is_watchlist=is_watchlist,
            )
            # Build breakdown for audit trail
            from impact_engine import EVENT_WEIGHTS, DEFAULT_EVENT_WEIGHT
            event_weight = EVENT_WEIGHTS.get(event.event_type, DEFAULT_EVENT_WEIGHT)
            watchlist_boost = 100 if is_watchlist else 0
            if (sentiment_delta or 0) > 0.5:
                sent_factor = 90
            elif (sentiment_delta or 0) > 0.2:
                sent_factor = 70
            else:
                sent_factor = 50
            
            gov_penalty = 0
            if governance_audit:
                failed_checks = sum(1 for a in governance_audit if not a.get("passed"))
                gov_penalty = failed_checks * 3  # small penalty per failed check
            
            impact_breakdown = {
                "base_event": {"label": event.event_type, "weight": event_weight, "contribution": round(0.30 * event_weight, 1)},
                "confidence": {"value": adjusted_confidence, "contribution": round(0.40 * adjusted_confidence, 1)},
                "sentiment": {"aligned": sentiment_match, "factor": sent_factor, "contribution": round(0.20 * sent_factor, 1)},
                "watchlist": {"is_watched": is_watchlist, "boost": watchlist_boost, "contribution": round(0.10 * watchlist_boost, 1)},
                "governance_penalty": gov_penalty,
                "total": impact_score,
            }
            pipeline_log("SCORING", f"Impact: {impact_score}/100")
        except Exception as e:
            logger.warning(f"[PIPELINE] Impact scoring failed (continuing): {e}")
            pipeline_log("SCORING", f"Scoring failed: {e}", "warning")
        
        # Build final signal
        total_time = round(time.time() - pipeline_start, 1)
        
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
            # New fields
            chain_of_thought=chain_of_thought,
            key_facts=key_facts,
            form_data=form_data,
            governance_audit=governance_audit,
            impact_breakdown=impact_breakdown,
            news_headlines=news_headlines if news_headlines else None,
            news_sentiment=news_sentiment_label,
            divergence_type=divergence_type,
            run_id=run_id,
        )
        
        pipeline_log("STORE", f"Signal saved to Supabase", "success", run_id=run_id)
        pipeline_log("PIPELINE", f"{signal.ticker} complete ({total_time}s total)", "success", run_id=run_id)
        
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
        # New JSONB fields
        if signal.chain_of_thought is not None:
            row["chain_of_thought"] = json.dumps(signal.chain_of_thought)
        if signal.governance_audit is not None:
            row["governance_audit"] = json.dumps(signal.governance_audit)
        if signal.impact_breakdown is not None:
            row["impact_breakdown"] = json.dumps(signal.impact_breakdown)
        if signal.news_headlines is not None:
            row["news_headlines"] = json.dumps(signal.news_headlines)
        if signal.news_sentiment is not None:
            row["news_sentiment"] = signal.news_sentiment
        if signal.divergence_type is not None:
            row["divergence_type"] = signal.divergence_type
        if signal.extraction_source is not None:
            row["extraction_source"] = signal.extraction_source
        if signal.extraction_time_ms is not None:
            row["extraction_time_ms"] = signal.extraction_time_ms
        if signal.key_facts is not None:
            row["key_facts"] = json.dumps(signal.key_facts)
        if signal.form_data is not None:
            row["form_data"] = json.dumps(signal.form_data)
        if signal.run_id is not None:
            row["run_id"] = signal.run_id
        return row
