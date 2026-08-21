-- Feature-Request Triage Agent: classifies each feedback item as
-- bug/feature_request/question/other, so clustering (which feeds
-- roadmap-feature generation) can exclude bug reports and questions.

-- pipeline_jobs.stage is a real Postgres enum (see 001_init.sql), not a
-- text check constraint like roadmap.bucket — needs ALTER TYPE, not a
-- constraint rewrite. Must run as its own statement (can't be used in the
-- same transaction it's added in on older Postgres, so keep this first/
-- separate if your SQL editor batches statements as one transaction).
alter type pipeline_stage add value if not exists 'triage';

create table if not exists feedback_triage (
  id uuid primary key default gen_random_uuid(),
  feedback_item_id uuid not null references feedback_items(id) on delete cascade unique,
  feedback_type text not null check (feedback_type in ('bug', 'feature_request', 'question', 'other')),
  rationale text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_feedback_triage_type on feedback_triage (feedback_type);
