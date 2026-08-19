-- Customer Intelligence Copilot — initial schema
-- Apply in Supabase SQL Editor (or via supabase db push)

create extension if not exists vector;
create extension if not exists "uuid-ossp";

-- ─── Shared feedback ingest ───────────────────────────────────────────────────

create type feedback_source as enum ('playstore', 'ticket');

create table if not exists feedback_items (
  id uuid primary key default gen_random_uuid(),
  source feedback_source not null,
  company text not null,
  text text not null,
  rating numeric null,
  timestamp timestamptz not null,
  customer_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- Dedup key for re-imports (source-specific external id when available)
  external_id text null,
  unique (source, company, external_id)
);

create index if not exists idx_feedback_company on feedback_items (company);
create index if not exists idx_feedback_source on feedback_items (source);
create index if not exists idx_feedback_timestamp on feedback_items (timestamp desc);
create index if not exists idx_feedback_company_source on feedback_items (company, source);

-- ─── Step 1: Pain points ──────────────────────────────────────────────────────

create table if not exists pain_points (
  id uuid primary key default gen_random_uuid(),
  feedback_item_id uuid not null references feedback_items (id) on delete cascade,
  pain_point_summary text not null,
  severity smallint not null check (severity between 1 and 5),
  sentiment text not null check (sentiment in ('positive', 'neutral', 'negative')),
  product_area text not null,
  embedding vector(1024) null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (feedback_item_id)
);

create index if not exists idx_pain_points_severity on pain_points (severity);
create index if not exists idx_pain_points_sentiment on pain_points (sentiment);
create index if not exists idx_pain_points_product_area on pain_points (product_area);

-- ─── Step 2: Churn signals ────────────────────────────────────────────────────

create table if not exists churn_signals (
  id uuid primary key default gen_random_uuid(),
  feedback_item_id uuid not null references feedback_items (id) on delete cascade,
  churn_risk text not null check (churn_risk in ('none', 'low', 'medium', 'high')),
  churn_signal text not null,
  signal_type text not null check (
    signal_type in (
      'cancellation_intent',
      'competitor_mention',
      'repeated_complaint',
      'frustration_escalation',
      'none'
    )
  ),
  weighted_score numeric null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (feedback_item_id)
);

create index if not exists idx_churn_risk on churn_signals (churn_risk);
create index if not exists idx_churn_signal_type on churn_signals (signal_type);

-- ─── Step 3: Clusters ─────────────────────────────────────────────────────────

create table if not exists clusters (
  id uuid primary key default gen_random_uuid(),
  cluster_index integer not null,
  cluster_label text not null,
  cluster_summary text not null,
  representative_quotes jsonb not null default '[]'::jsonb,
  item_count integer not null default 0,
  avg_severity numeric null,
  k integer not null,
  run_id uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists feedback_clusters (
  feedback_item_id uuid not null references feedback_items (id) on delete cascade,
  cluster_id uuid not null references clusters (id) on delete cascade,
  run_id uuid not null,
  primary key (feedback_item_id, run_id)
);

create index if not exists idx_feedback_clusters_cluster on feedback_clusters (cluster_id);

-- ─── Step 4: Features ─────────────────────────────────────────────────────────

create table if not exists features (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references clusters (id) on delete cascade,
  feature_name text not null,
  description text not null,
  impact_score numeric not null,
  effort_estimate text not null check (effort_estimate in ('XS', 'S', 'M', 'L', 'XL')),
  created_at timestamptz not null default now()
);

create index if not exists idx_features_cluster on features (cluster_id);
create index if not exists idx_features_impact on features (impact_score desc);

-- ─── Step 5: Roadmap ──────────────────────────────────────────────────────────

create table if not exists roadmap (
  id uuid primary key default gen_random_uuid(),
  feature_id uuid not null references features (id) on delete cascade,
  bucket text not null check (bucket in ('now', 'next', 'later')),
  rationale text not null,
  sort_order integer not null default 0,
  manually_overridden boolean not null default false,
  run_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (feature_id, run_id)
);

create index if not exists idx_roadmap_bucket on roadmap (bucket, sort_order);

-- ─── Pipeline job queue ───────────────────────────────────────────────────────

create type pipeline_stage as enum (
  'pain_points',
  'churn',
  'cluster',
  'features',
  'roadmap'
);

create type job_status as enum (
  'pending',
  'running',
  'completed',
  'failed'
);

create table if not exists pipeline_jobs (
  id uuid primary key default gen_random_uuid(),
  stage pipeline_stage not null,
  status job_status not null default 'pending',
  company_filter text null,
  records_processed integer not null default 0,
  records_total integer not null default 0,
  error_message text null,
  token_usage jsonb not null default '{}'::jsonb,
  estimated_cost_usd numeric null,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pipeline_jobs_stage on pipeline_jobs (stage, created_at desc);

-- ─── AI suggestions cache (dashboard) ─────────────────────────────────────────

create table if not exists ai_suggestions_cache (
  id uuid primary key default gen_random_uuid(),
  filter_key text not null unique,
  suggestions jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Cluster run tracking ─────────────────────────────────────────────────────

create table if not exists cluster_runs (
  id uuid primary key default gen_random_uuid(),
  k integer not null,
  status job_status not null default 'pending',
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);
