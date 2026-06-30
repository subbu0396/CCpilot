-- Analysis pipeline tables (Stage 2)
-- Run after 001_initial_schema.sql

-- Pain point extraction per feedback item
CREATE TABLE IF NOT EXISTS pain_points (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  feedback_item_id UUID NOT NULL REFERENCES feedback_items(id) ON DELETE CASCADE,
  summary          TEXT NOT NULL,
  severity         INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5),
  sentiment        TEXT NOT NULL CHECK (sentiment IN ('positive', 'neutral', 'negative', 'mixed')),
  product_area     TEXT NOT NULL,
  analyzed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (feedback_item_id)
);

CREATE INDEX IF NOT EXISTS idx_pain_points_severity ON pain_points (severity DESC);
CREATE INDEX IF NOT EXISTS idx_pain_points_product_area ON pain_points (product_area);
CREATE INDEX IF NOT EXISTS idx_pain_points_sentiment ON pain_points (sentiment);

-- Churn risk per feedback item (aggregated to customer in queries)
CREATE TABLE IF NOT EXISTS churn_assessments (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  feedback_item_id UUID NOT NULL REFERENCES feedback_items(id) ON DELETE CASCADE,
  customer_id      TEXT,
  risk_level       TEXT NOT NULL CHECK (risk_level IN ('none', 'low', 'medium', 'high')),
  justification  TEXT NOT NULL,
  source_weight    NUMERIC(4, 2) NOT NULL DEFAULT 1,
  analyzed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (feedback_item_id)
);

CREATE INDEX IF NOT EXISTS idx_churn_assessments_risk ON churn_assessments (risk_level);
CREATE INDEX IF NOT EXISTS idx_churn_assessments_customer ON churn_assessments (customer_id);

-- Vector embeddings for clustering
CREATE TABLE IF NOT EXISTS feedback_embeddings (
  feedback_item_id UUID PRIMARY KEY REFERENCES feedback_items(id) ON DELETE CASCADE,
  embedding        vector(1024),
  model            TEXT NOT NULL DEFAULT 'voyage-3',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Themed clusters
CREATE TABLE IF NOT EXISTS feedback_clusters (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label         TEXT NOT NULL,
  summary       TEXT NOT NULL,
  size          INTEGER NOT NULL DEFAULT 0,
  avg_severity  NUMERIC(4, 2),
  sample_quotes JSONB NOT NULL DEFAULT '[]',
  pipeline_run_id UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cluster_members (
  cluster_id       UUID NOT NULL REFERENCES feedback_clusters(id) ON DELETE CASCADE,
  feedback_item_id UUID NOT NULL REFERENCES feedback_items(id) ON DELETE CASCADE,
  PRIMARY KEY (cluster_id, feedback_item_id)
);

-- Feature suggestions derived from clusters
CREATE TABLE IF NOT EXISTS feature_suggestions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cluster_id      UUID REFERENCES feedback_clusters(id) ON DELETE SET NULL,
  feature_name    TEXT NOT NULL,
  description     TEXT NOT NULL,
  impact_estimate TEXT NOT NULL CHECK (impact_estimate IN ('low', 'medium', 'high')),
  effort_size     TEXT NOT NULL CHECK (effort_size IN ('S', 'M', 'L', 'XL')),
  pipeline_run_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Roadmap buckets
CREATE TABLE IF NOT EXISTS roadmap_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  feature_id  UUID NOT NULL REFERENCES feature_suggestions(id) ON DELETE CASCADE,
  bucket      TEXT NOT NULL CHECK (bucket IN ('now', 'next', 'later')),
  rationale   TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (feature_id)
);

CREATE INDEX IF NOT EXISTS idx_roadmap_items_bucket ON roadmap_items (bucket, sort_order);

-- Track full pipeline runs
CREATE TABLE IF NOT EXISTS analysis_pipeline_runs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status        TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  current_stage TEXT,
  stages_done   JSONB NOT NULL DEFAULT '[]',
  error_message TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started ON analysis_pipeline_runs (started_at DESC);

-- Job queue idempotency: one active job per stage
CREATE UNIQUE INDEX IF NOT EXISTS idx_analysis_jobs_stage_pending
  ON analysis_jobs (stage)
  WHERE status IN ('pending', 'running');
