-- Adds a "shipped" roadmap bucket and a jira_status column, for the
-- Jira -> CCPilot feedback loop: when a linked Jira issue reaches Jira's
-- "Done" status category, the roadmap item auto-moves to "shipped" and its
-- raw Jira status name is tracked for display.

alter table roadmap drop constraint if exists roadmap_bucket_check;
alter table roadmap add constraint roadmap_bucket_check check (bucket in ('now', 'next', 'later', 'shipped'));
alter table roadmap add column if not exists jira_status text null;
