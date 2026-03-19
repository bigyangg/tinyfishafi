# signal_pipeline.py — Core Signal Processing Orchestrator
# Purpose: Routes filings through Classify -> Enrich -> Govern -> Score -> Store -> Alert
# Uses registry pattern so new filing types plug in without modifying this file
# Dependencies: event_classifier, market_data, sentiment_analyzer, impact_engine, governance

import logging
import os
import json
import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


async def call_gemini_with_retry(generate_fn, max_retries: int = 3):
    """Wrapper for Gemini API calls with exponential backoff on rate limits.

    Args:
        generate_fn: A callable (typically a lambda wrapping model.generate_content)
                     that will be run in a thread via asyncio.to_thread.
        max_retries: Maximum number of retry attempts before raising.

    Returns:
        The result of generate_fn on success.

    Raises:
        Exception: If all retries are exhausted.
    """
    for attempt in range(max_retries):
        try:
            result = await asyncio.to_thread(generate_fn)
            return result
        except Exception as e:
            err_str = str(e).lower()
            if "429" in str(e) or "quota" in err_str or "rate" in err_str:
                wait = 2 ** attempt
                logger.warning(f"Gemini rate limited (attempt {attempt+1}/{max_retries}), waiting {wait}s")
                await asyncio.sleep(wait)
            elif attempt == max_retries - 1:
                raise
            else:
                await asyncio.sleep(1)
    raise Exception(f"Gemini API failed after {max_retries} retries")

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
    divergence_score: Optional[int] = None
    divergence_details: Optional[str] = None
    extraction_source: Optional[str] = None
    extraction_time_ms: Optional[int] = None
    run_id: Optional[str] = None
    content_hash: Optional[str] = None
    # Short interest enrichment
    short_percent_float: Optional[float] = None
    days_to_cover: Optional[float] = None
    # Correlation + category enrichment
    why_it_matters: Optional[str] = None
    market_impact: Optional[str] = None
    category_primary: Optional[str] = None
    category_secondary: Optional[list] = None
    tags: Optional[list] = None
    correlations: Optional[dict] = None
    related_entities: Optional[list] = None
    chain_reactions: Optional[list] = None
    sector: Optional[str] = None


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

        try:
            from processors.form_nt import FormNTProcessor
            self.register_processor("NT 10-K", FormNTProcessor())
            self.register_processor("NT 10-Q", FormNTProcessor())
        except Exception as e:
            logger.error(f"[PIPELINE] Failed to register NT processor: {e}")

        try:
            from processors.form_8k import Form8KProcessor
            self.register_processor("8-K/A", Form8KProcessor())
        except Exception as e:
            logger.error(f"[PIPELINE] Failed to register 8-K/A processor: {e}")

    def _is_junk_signal(self, result: dict, filing_text: str) -> bool:
        """Only discard truly empty/worthless signals.

        NEVER discard signals from real company tickers (1-5 uppercase letters).
        Only discard UNKNOWN__ CIK placeholders with truly empty content.
        """
        import re
        ticker = result.get("ticker", "")
        confidence = result.get("confidence", 0)
        summary = result.get("summary", "")

        # Real ticker = 1-5 uppercase letters — keep it unconditionally
        if re.match(r'^[A-Z]{1,5}$', ticker or ""):
            return False

        # UNKNOWN__ CIK placeholder: discard only if keyword analysis and trivially empty
        if "UNKNOWN__" in (ticker or ""):
            return (
                confidence <= 55
                and "keyword analysis" in summary.lower()
                and len(summary) < 80
            )

        # Keep everything else (e.g. UNKNOWN without CIK suffix — borderline, keep)
        return False

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
        Unhandled exceptions are recorded in the failed_filings dead-letter table.
        """
        import time
        pipeline_start = time.time()
        filing_type = filing.filing_type
        # Mutable list so _process_inner can update the stage visible to this scope
        stage_ref = ["init"]

        try:
            return self._process_inner(filing, watchlist_tickers, run_id, pipeline_start, filing_type, stage_ref)
        except Exception as e:
            logger.error(
                f"[PIPELINE] Unhandled failure for {filing.accession_number} "
                f"(stage={stage_ref[0]}, ticker=unknown, type={filing_type}): "
                f"{type(e).__name__}: {e}",
                exc_info=True,
            )
            try:
                self._supabase.table("failed_filings").upsert({
                    "accession_number": filing.accession_number,
                    "form_type": filing_type,
                    "company": filing.company_name,
                    "cik": filing.entity_id,
                    "filed_at": filing.filed_at,
                    "error_stage": stage_ref[0],
                    "error_message": f"{type(e).__name__}: {str(e)[:500]}",
                }).execute()
            except Exception as insert_err:
                logger.error(f"[PIPELINE] Failed to insert into failed_filings: {insert_err}")
            return None

    def _process_inner(self, filing: RawFiling, watchlist_tickers, run_id, pipeline_start, filing_type, stage_ref) -> Optional[ProcessedSignal]:
        """Inner pipeline body. stage_ref[0] is updated at each step so the outer wrapper
        can record which stage an unhandled exception occurred in."""
        import time

        # Step 1: Get the right processor
        stage_ref[0] = "processor_lookup"
        processor = self._processors.get(filing_type)
        if not processor:
            logger.warning(f"[PIPELINE] No processor for filing type: {filing_type}")
            pipeline_log("PIPELINE", f"No processor for filing type: {filing_type}", "warning")
            return None

        # Step 2: Classify
        stage_ref[0] = "classification"
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
        
        if classification.get("signal") == "Pending" or classification.get("confidence", 0) == 0:
            # conf:0 means complete classification failure — don't pollute the feed
            logger.warning(
                f"[PIPELINE] Dropping conf:0 Pending signal for {filing.accession_number} "
                f"({filing_type}) — will retry via dead-letter queue"
            )
            return None
            
        if not is_valid_signal(classification.get("ticker", ""), classification.get("summary", "")):
            logger.warning(f"[PIPELINE] Discarding junk signal (pattern match): {classification.get('summary', '')[:60]}")
            return None

        if self._is_junk_signal(classification, filing.filing_text or ""):
            logger.warning(f"[PIPELINE] Discarding junk signal (low quality): conf={classification.get('confidence', 0)}, summary={classification.get('summary', '')[:60]}")
            return None
        
        # Extract chain of thought + key facts from classification
        chain_of_thought = classification.get("chain_of_thought")
        key_facts = classification.get("key_facts", [])
        form_data = classification.get("form_data")
        
        # Step 3: Event classification (deterministic taxonomy)
        stage_ref[0] = "event_classification"
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
        stage_ref[0] = "market_data"
        ticker = classification["ticker"]
        price_at_filing = None
        news_headlines = []
        short_interest_data = {}

        try:
            mds = self.get_market_data()
            price_at_filing = mds.get_price(ticker)
            news_items = mds.get_news_headlines(ticker, limit=5)
            news_headlines = [item.title for item in news_items]
            short_interest_data = mds.get_short_interest(ticker)
        except Exception as e:
            logger.warning(f"[PIPELINE] Market data enrichment failed (continuing): {e}")
        
        # Step 5: Sentiment analysis
        stage_ref[0] = "sentiment"
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
        stage_ref[0] = "governance"
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
        stage_ref[0] = "impact_scoring"
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
        
        # Step 7b: Correlation + category enrichment
        stage_ref[0] = "correlation"
        correlations = {}
        related_entities = []
        chain_reactions = []
        sector = None
        category_primary = None
        category_secondary = []
        tags = []
        why_it_matters_text = classification.get("why_it_matters", "")
        market_impact_text = classification.get("market_impact", "")
        try:
            from intelligence.correlation_engine import build_correlations
            correlations = build_correlations(
                signal={"ticker": ticker, "event_type": event.event_type, "signal": event.signal},
                enrichment_data={"news_dominant_theme": news_sentiment_label or ""},
            )
            related_entities = correlations.get("related_entities", [])
            chain_reactions = correlations.get("chain_reactions", [])
            sector = correlations.get("sector")
            pipeline_log("CORRELATIONS", f"Related entities: {len(related_entities)}, chain reactions: {len(chain_reactions)}", "success")
        except Exception as e:
            logger.warning(f"[PIPELINE] Correlation engine failed (continuing): {e}")

        try:
            from intelligence.category_mapper import map_categories, generate_why_it_matters
            cats = map_categories(ticker, event.event_type)
            category_primary = cats["primary"]
            category_secondary = cats["secondary"]
            tags = cats["tags"]
            if not why_it_matters_text:
                why_it_matters_text = generate_why_it_matters(ticker, event.event_type)
            pipeline_log("CATEGORIES", f"{category_primary} → {category_secondary[:2]}", "success")
        except Exception as e:
            logger.warning(f"[PIPELINE] Category mapping failed (continuing): {e}")

        # Step 7c: Compute divergence score from filing signal vs news/social sentiment
        stage_ref[0] = "divergence_score"
        divergence_score_val = None
        divergence_details_val = None
        try:
            from intelligence.enrichment_pipeline import compute_divergence_score
            div_result = compute_divergence_score(
                filing_signal=event.signal,
                news_sentiment=news_sentiment_label,
                social_sentiment=None,  # social enrichment not available in sync pipeline
                ticker=ticker,
            )
            if div_result and div_result.get("score", 0) > 0:
                divergence_score_val = div_result.get("score")
                # Override divergence_type only if not already set by governance
                if not divergence_type:
                    divergence_type = div_result.get("type", "NONE")
                divergence_details_val = div_result.get("details", "")
        except Exception as e:
            logger.warning(f"[PIPELINE] Divergence compute failed (continuing): {e}")

        # Build final signal
        stage_ref[0] = "build_signal"
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
            divergence_score=divergence_score_val,
            divergence_details=divergence_details_val,
            run_id=run_id,
            short_percent_float=short_interest_data.get('short_percent_float') if short_interest_data else None,
            days_to_cover=short_interest_data.get('short_ratio') if short_interest_data else None,
            why_it_matters=why_it_matters_text,
            market_impact=market_impact_text,
            category_primary=category_primary,
            category_secondary=category_secondary,
            tags=tags,
            correlations=correlations,
            related_entities=related_entities,
            chain_reactions=chain_reactions,
            sector=sector,
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
        if signal.divergence_score is not None:
            row["divergence_score"] = signal.divergence_score
        if signal.divergence_details is not None:
            row["divergence_details"] = signal.divergence_details
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
        if signal.content_hash is not None:
            row["content_hash"] = signal.content_hash
        if signal.short_percent_float is not None:
            row["short_percent_float"] = signal.short_percent_float
        if signal.days_to_cover is not None:
            row["days_to_cover"] = signal.days_to_cover
        if signal.why_it_matters is not None:
            row["why_it_matters"] = signal.why_it_matters
        if signal.market_impact is not None:
            row["market_impact"] = signal.market_impact
        if signal.category_primary is not None:
            row["category_primary"] = signal.category_primary
        if signal.category_secondary is not None:
            row["category_secondary"] = json.dumps(signal.category_secondary)
        if signal.tags is not None:
            row["tags"] = json.dumps(signal.tags)
        if signal.correlations is not None:
            row["correlations"] = json.dumps(signal.correlations)
        if signal.related_entities is not None:
            row["related_entities"] = json.dumps(signal.related_entities)
        if signal.chain_reactions is not None:
            row["chain_reactions"] = json.dumps(signal.chain_reactions)
        if signal.sector is not None:
            row["sector"] = signal.sector
        return row
