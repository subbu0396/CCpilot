-- Tracks the Jira issue auto-created when a roadmap item is dragged into "Now".

alter table roadmap add column if not exists jira_issue_key text null;
alter table roadmap add column if not exists jira_issue_url text null;
