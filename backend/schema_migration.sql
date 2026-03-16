-- AFI Phase 3 Schema Migration
-- Non-destructive: all new columns nullable, no drops
-- Run in Supabase SQL Editor or via service role client

-- ============================================
-- 1. Extend signals table
-- ============================================

-- Event taxonomy classification (e.g. EARNINGS_BEAT, EXEC_DEPARTURE)
ALTER TABLE signals ADD COLUMN IF NOT EXISTS event_type TEXT;

-- Filing subtype (e.g. "8-K Item 2.02", "13D/A")
ALTER TABLE signals ADD COLUMN IF NOT EXISTS filing_subtype TEXT;

-- Sentiment enrichment (Option A: filing signal vs current news tone)
ALTER TABLE signals ADD COLUMN IF NOT EXISTS sentiment_delta REAL;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS news_sentiment_score REAL;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS sentiment_match BOOLEAN;

-- Impact scoring (composite 0-100)
ALTER TABLE signals ADD COLUMN IF NOT EXISTS impact_score INTEGER;

-- User correction feedback loop
ALTER TABLE signals ADD COLUMN IF NOT EXISTS user_correction TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS correction_count INTEGER DEFAULT 0;

-- Config versioning (which config was active when this signal was classified)
ALTER TABLE signals ADD COLUMN IF NOT EXISTS config_version_at_classification INTEGER;

-- ============================================
-- 1b. Phase 6: Audit trail columns
-- ============================================

-- Filing form type (8-K, 10-K, 10-Q, 4, SC 13D) — defaults to 8-K for existing rows
ALTER TABLE signals ADD COLUMN IF NOT EXISTS filing_form TEXT DEFAULT '8-K';

-- Chain of thought reasoning from Gemini (6 step breakdown)
ALTER TABLE signals ADD COLUMN IF NOT EXISTS chain_of_thought JSONB;

-- Governance audit trail (5 checks with pass/fail and reason)
ALTER TABLE signals ADD COLUMN IF NOT EXISTS governance_audit JSONB;

-- Impact score breakdown (base event, confidence, sentiment, watchlist contributions)
ALTER TABLE signals ADD COLUMN IF NOT EXISTS impact_breakdown JSONB;

-- News cross-reference data
ALTER TABLE signals ADD COLUMN IF NOT EXISTS news_headlines JSONB;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS news_sentiment TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS divergence_type TEXT;

-- Extraction metadata
ALTER TABLE signals ADD COLUMN IF NOT EXISTS extraction_source TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS extraction_time_ms INTEGER;

-- Key facts and form-specific data
ALTER TABLE signals ADD COLUMN IF NOT EXISTS key_facts JSONB;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS form_data JSONB;

-- ============================================
-- 2. Price correlations table
-- ============================================

CREATE TABLE IF NOT EXISTS price_correlations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_id UUID REFERENCES signals(id) ON DELETE CASCADE,
    ticker TEXT NOT NULL,
    price_at_filing REAL,
    check_1h_at TIMESTAMPTZ,
    check_24h_at TIMESTAMPTZ,
    check_3d_at TIMESTAMPTZ,
    price_1h REAL,
    price_24h REAL,
    price_3d REAL,
    pct_change_1h REAL,
    pct_change_24h REAL,
    pct_change_3d REAL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_correlations_pending_1h
    ON price_correlations (check_1h_at) WHERE price_1h IS NULL;
CREATE INDEX IF NOT EXISTS idx_price_correlations_pending_24h
    ON price_correlations (check_24h_at) WHERE price_24h IS NULL;
CREATE INDEX IF NOT EXISTS idx_price_correlations_pending_3d
    ON price_correlations (check_3d_at) WHERE price_3d IS NULL;

-- ============================================
-- 3. Agent config table (admin-managed)
-- ============================================

CREATE TABLE IF NOT EXISTS agent_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_version INTEGER NOT NULL DEFAULT 1,
    tier1_tickers JSONB DEFAULT '[]'::jsonb,
    tier2_sectors JSONB DEFAULT '[]'::jsonb,
    pending_promotions JSONB DEFAULT '[]'::jsonb,
    settings JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default config row if table is empty
INSERT INTO agent_config (config_version, tier1_tickers, tier2_sectors, pending_promotions, settings)
SELECT 1, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 
    '{"poll_interval": 120, "enrichment_timeout": 3, "alert_threshold": 60}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM agent_config LIMIT 1);

-- ============================================
-- 4. Enrichment & Genome Columns (Phase 7)
-- ============================================

CREATE TABLE IF NOT EXISTS company_genomes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT UNIQUE NOT NULL,
  cik TEXT,
  genome_data JSONB,
  genome_score INTEGER,
  genome_trend TEXT CHECK (genome_trend IN ('IMPROVING', 'STABLE', 'DETERIORATING', 'CRITICAL')),
  pattern_matches JSONB,
  genome_alert BOOLEAN DEFAULT false,
  last_updated TIMESTAMPTZ DEFAULT now(),
  filing_history_analyzed INTEGER
);

ALTER TABLE signals ADD COLUMN IF NOT EXISTS news_dominant_theme TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS reddit_sentiment NUMERIC;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS stocktwits_sentiment NUMERIC;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS social_volume_spike BOOLEAN;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS social_vs_filing_delta TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS insider_net_30d NUMERIC;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS insider_net_90d NUMERIC;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS insider_ceo_activity TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS insider_unusual_delay BOOLEAN;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS congress_net_sentiment TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS congress_trades JSONB;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS congress_suspicious_timing BOOLEAN;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS congress_timing_note TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS divergence_score INTEGER;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS divergence_severity TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS contradiction_summary TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS public_claim TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS filing_reality TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS genome_score INTEGER;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS genome_trend TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS genome_pattern_matches JSONB;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS genome_alert BOOLEAN;
