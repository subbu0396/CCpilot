-- Customer Intelligence Copilot — initial schema
-- Run via Supabase CLI or paste into Supabase SQL editor

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Normalized feedback from all ingestion sources
CREATE TABLE IF NOT EXISTS feedback_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id   TEXT NOT NULL,
  source        TEXT NOT NULL CHECK (source IN ('playstore', 'call', 'ticket', 'review')),
  text          TEXT NOT NULL,
  rating        NUMERIC(3, 2),
  timestamp     TIMESTAMPTZ NOT NULL,
  customer_id   TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_items_source ON feedback_items (source);
CREATE INDEX IF NOT EXISTS idx_feedback_items_timestamp ON feedback_items (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_items_customer_id ON feedback_items (customer_id);

-- Ingestion run audit trail (MCP server writes here)
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source            TEXT NOT NULL CHECK (source IN ('playstore', 'call', 'ticket', 'review')),
  status            TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  records_imported  INTEGER NOT NULL DEFAULT 0,
  records_skipped   INTEGER NOT NULL DEFAULT 0,
  file_path         TEXT,
  error_message     TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_source ON ingestion_runs (source, started_at DESC);

-- Reserved for analysis pipeline (Stage 2+)
CREATE TABLE IF NOT EXISTS analysis_jobs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stage         TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  payload       JSONB NOT NULL DEFAULT '{}',
  result        JSONB,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_stage_status ON analysis_jobs (stage, status);
