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
