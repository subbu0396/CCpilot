-- Pipeline run state for multi-request batch processing (clustering groups, etc.)
ALTER TABLE analysis_pipeline_runs
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}';
