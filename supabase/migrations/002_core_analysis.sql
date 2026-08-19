-- Core Analysis Agent output — one row per feedback item, written by the
-- real-time Zendesk webhook pipeline (see app/api/webhooks/zendesk).

create table if not exists core_analysis (
  id uuid primary key default gen_random_uuid(),
  feedback_item_id uuid not null references feedback_items (id) on delete cascade,
  sentiment text not null check (sentiment in ('POSITIVE', 'NEUTRAL', 'NEGATIVE')),
  churn_risk_score numeric not null check (churn_risk_score >= 0 and churn_risk_score <= 1),
  primary_pain_point text not null,
  category text not null check (
    category in ('UI/UX', 'PERFORMANCE', 'BILLING', 'FEATURE_REQUEST', 'BUG', 'OTHER')
  ),
  key_quotes jsonb not null default '[]'::jsonb,
  actionable_recommendation text not null,
  zendesk_priority_escalation boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (feedback_item_id)
);

create index if not exists idx_core_analysis_escalation on core_analysis (zendesk_priority_escalation);
create index if not exists idx_core_analysis_churn_score on core_analysis (churn_risk_score desc);
