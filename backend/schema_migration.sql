-- AFI v3 Migration: Run this in Supabase SQL Editor
-- 1. Create company_genomes table
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

-- 2. Add v3 enrichment columns to signals table
ALTER TABLE signals ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS impact_score TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS early_warning_score INTEGER;
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
ALTER TABLE signals ADD COLUMN IF NOT EXISTS tinyfish_context JSONB;

-- Phase 10: Dead-letter queue for failed filings
CREATE TABLE IF NOT EXISTS failed_filings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    accession_number TEXT UNIQUE NOT NULL,
    form_type TEXT,
    company TEXT,
    cik TEXT,
    filed_at TIMESTAMPTZ,
    error_stage TEXT,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    next_retry_at TIMESTAMPTZ DEFAULT NOW(),
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_failed_filings_retry ON failed_filings(resolved, retry_count, next_retry_at);

-- Phase 10: Content hash deduplication for signals
ALTER TABLE signals ADD COLUMN IF NOT EXISTS content_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_signals_content_hash ON signals(content_hash);

-- Phase 3 upgrade: Short interest enrichment
ALTER TABLE signals ADD COLUMN IF NOT EXISTS short_percent_float REAL;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS days_to_cover REAL;

-- Phase 3 upgrade: Options activity enrichment
ALTER TABLE signals ADD COLUMN IF NOT EXISTS options_activity JSONB;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS put_call_ratio REAL;
