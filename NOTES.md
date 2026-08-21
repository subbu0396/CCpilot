# Change Notes

Running log of what changed and why, newest first. For full detail see the
commit each entry references.

## 2026-08-22 — Feature-Request Triage Agent

Bug reports, feature requests, and plain questions were all treated
uniformly by the batch pipeline — every feedback item went through
pain-point/churn scoring and could end up in the same cluster that
`runFeatures()` turns into a candidate roadmap item, regardless of whether
it was actually a feature idea, a bug complaint, or someone asking how
something works. A `category` classifier already existed
(`CoreAnalysisOutputSchema`'s `FEATURE_REQUEST`/`BUG`/etc.), but it's
real-time-webhook-only, fully disconnected from the batch pipeline, and
mixes "type" values with "product area" values in one 6-way enum — not a
clean type classifier to reuse.

- New pipeline stage, `lib/pipeline/triage.ts` (`runTriage`), classifies
  each feedback item into a clean `bug | feature_request | question |
  other`, one Claude call per item (same `mapWithConcurrency`/`startJob`/
  `finishJob` pattern as `pain-points.ts`, heuristic keyword fallback when
  no API key), upserted into a new `feedback_triage` table by
  `feedback_item_id` (idempotent re-runs, verified).
- `lib/pipeline/cluster.ts`'s `loadPainPoints()` now excludes pain points
  whose feedback item was explicitly triaged `bug` or `question` before
  embedding/k-means — so `runFeatures()`/`runRoadmap()` only ever build
  roadmap items from feature-request-shaped feedback. Bug reports still get
  full pain-point/churn scoring and stay visible on Pain Points/Churn Risk —
  they're just excluded from becoming candidate "features." An **untriaged**
  feedback item (triage never run, or hasn't reached it) is included by
  default — the filter only excludes items explicitly triaged out, so
  historical data isn't silently dropped from clustering.
- New stage wired into every existing dispatch point the same way as the
  other 5 stages: `app/api/pipeline/route.ts`'s switch (and the `"all"`
  sequence, running first), `scripts/run-pipeline.ts`'s `--stage` dispatch,
  `Admin.tsx`'s `STAGES` table (existing re-run-button/job-history UI picks
  it up automatically, no new UI code).
- New MCP read tool, `get_triage_queue`, surfaces feature-request-tagged
  feedback by company — "what's been asked for that isn't on the roadmap
  yet" — via `loadDashboardBundle()`'s new `feedbackTriage` field (loaded
  the same way `coreAnalysis` already is).
- `supabase/migrations/005_feedback_triage.sql` — two things worth noting:
  the new table, **and** `alter type pipeline_stage add value if not exists
  'triage'`. `pipeline_jobs.stage` is a real Postgres enum (unlike
  `roadmap.bucket`, which is a text `check` constraint) — missed this on the
  first pass, caught when `runTriage()` failed against production with
  `invalid input value for enum pipeline_stage: "triage"`; fixed by adding
  the `ALTER TYPE` statement (must run as its own statement, not batched
  into a transaction with other DDL, since Postgres historically didn't
  allow using a new enum value in the same transaction that added it).
- Verified against real production data: ran triage for two companies (156
  real Flowdesk feedback items, spot-checked classifications against the
  actual text — bug/feature_request/other all came back sensible; this
  dataset had zero clear "question"-type items, plausible for review/ticket
  text), confirmed idempotent re-runs (no duplicate rows), confirmed the
  clustering filter's set logic directly against real `pain_points`/
  `feedback_triage` data (66 of 456 pain points correctly excluded, all
  untriaged items correctly retained), and confirmed `get_triage_queue`
  returns real feature-request feedback cross-checked against a direct
  Supabase count.
- **Not re-running `cluster`/`features`/`roadmap` against production** as
  part of this change (deliberate, matches this session's established
  caution) — doing so would delete/reinsert clusters/features/roadmap rows
  with new IDs, orphaning the roadmap items already linked to real Jira
  issues (KAN-1/2/3). The triage stage and filter logic are verified and
  live; actually exercising the filter in a real `runClustering()` call
  needs your separate explicit confirmation first.

## 2026-08-21 — Customer Health Briefing Agent + Jira→CCPilot feedback loop

Two more agents, following the same `lib/actions/*` shared-logic pattern as
everything else this session.

**Customer Health Briefing Agent** — a per-company rollup (churn risk
breakdown, top 5 pain points, escalations in the last 30 days, and roadmap
items affecting that company with their linked Jira issues), useful to prep
before an account call. `lib/actions/health.ts`'s `getCustomerHealthBriefing`
is the single implementation behind both `get_customer_health` (MCP tool)
and `GET /api/customer-health?company=X` (public — pure data assembly, no
Claude/Jira/Zendesk cost or write risk, same reasoning as `/api/dashboard`
being public). New dashboard panel: `components/dashboard/CustomerHealth.tsx`,
a company selector + four rollup cards, added as a new view alongside the
other 8 sections. `company` only lives on `FeedbackItem` — every other table
(pain points, churn signals, escalations) joins to it via `feedback_item_id`;
roadmap items reach it through a 4-hop chain
(`RoadmapItem → Feature → Cluster → feedback_clusters → FeedbackItem.company`),
the same join `lib/actions/explain.ts`'s `clusterChurnRisk()` already walks
for churn aggregation, extended here with a company lookup. Verified against
real production data for 3 companies, cross-checking the churn-count rollup
against a direct filter for the same company.

**Jira→CCPilot feedback loop** — until now the sync was one-directional
(`transition_jira_issue` pushes CCPilot state → Jira). This closes the loop:
an inbound `POST /api/webhooks/jira` reacts when a linked Jira issue's status
changes, and auto-moves the roadmap item to a new **4th bucket, "Shipped"**,
when the issue reaches Jira's "Done" **status category** (not name-matching
against "Done"/"Resolved"/"Closed" strings — Jira's `statusCategory.key` is
one of `new`/`indeterminate`/`done` and is stable across custom workflow
status names). The item's raw Jira status name is always recorded in a new
`jira_status` column regardless of category, so "In Progress" etc. shows up
on the card even when it doesn't trigger a bucket move.

- `supabase/migrations/004_roadmap_shipped.sql` — widened the `bucket` check
  constraint to include `'shipped'`, added `jira_status text null`. Applied
  manually via the Supabase SQL editor (same as every migration before it —
  this project has no direct Postgres connection configured, only the
  Supabase JS client, so DDL can't run from a script).
- **Registering the webhook is also a manual step.** Jira Cloud's REST
  webhook-registration endpoint (`POST /rest/api/3/webhook`) requires
  Connect/Forge app-level auth — a personal API token (what
  `lib/integrations/jira.ts` already uses for everything else) can't call it.
  Has to be registered in Jira's admin UI (Settings → System → WebHooks).
  Jira's webhook form also has no auth-header field like Zendesk's, so the
  shared secret is embedded in the webhook URL's query string instead:
  `.../api/webhooks/jira?token=<JIRA_WEBHOOK_SECRET>`
  (`lib/ingestion/jira-webhook.ts`'s `verifyJiraWebhookToken`, same
  `timingSafeEqual` comparison as `verifyZendeskBearerToken`, just reading a
  query param instead of a header).
- `lib/actions/roadmap-actions.ts` gained `getRoadmapItemByJiraKey` and
  `syncRoadmapFromJiraStatus` — the reverse direction of
  `createJiraForRoadmapItem`/`transitionJiraForRoadmap`. When the target
  roadmap item is already `manually_overridden` (e.g. a human already
  bucket-moved it), the auto-shipped move still applies — a Done Jira status
  is treated as a stronger, more concrete signal than the pipeline's own
  scoring, same as a human drag would be.
- Every hardcoded `["now","next","later"]` bucket list got `"shipped"` added:
  `app/api/roadmap/route.ts`'s PATCH validation, `mcp-server/tools/actions.ts`'s
  `moveRoadmapItem`, `mcp-server/index.ts`'s two tool schemas,
  `lib/dashboard/export-roadmap.ts`'s CSV/Markdown export sections, and the
  Roadmap kanban board (`lg:grid-cols-3` → `lg:grid-cols-4`). The scoring
  pipeline itself (`lib/pipeline/roadmap.ts`) needed no change — it only ever
  assigns now/next/later; "shipped" is exclusively webhook-driven.
- Verified against real production data via a temp script (deleted after
  use): confirmed a non-done status update only sets `jira_status` and
  leaves `bucket` untouched, a done status update moves `bucket` to
  `"shipped"` and sets `manually_overridden`, and restored the tested
  roadmap item's original state afterward so the verification run didn't
  leave production data altered. Also curl-tested the webhook route's auth:
  missing/wrong token → 401, correct token → 200 (no-op for issues not
  linked to any roadmap item).

## 2026-08-21 — MCP agents surfaced in the dashboard UI

Five agent actions previously reachable only via the `ccpilot` MCP server
(Claude Desktop/Code) now have real buttons in the dashboard: explaining a
roadmap item's scoring, creating/linking/transitioning a Jira issue, and
running the Core Analysis Agent as part of a Zendesk sync. Previously the
only way to trigger these was to switch to a chat client — the dashboard is
now a first-class way to drive them.

- **Dedup, not more duplication.** MCP's `mcp-server/tools/actions.ts` had
  already duplicated `createJiraForRoadmapItem` out of
  `app/api/roadmap/route.ts` (that route pulls in `requireAdminAuth()`, which
  a standalone MCP process doesn't have), and `mcp-server/tools/explain.ts` /
  `tools/sync.ts` held their own full implementations. Rather than write a
  *third* copy for the new HTTP routes, the shared logic moved into
  `lib/actions/roadmap-actions.ts`, `lib/actions/explain.ts`, and
  `lib/actions/sync.ts`. MCP's tool files and the new API routes are now both
  thin callers of one implementation each — verified against real production
  data (KAN-2) post-move to confirm the relocation didn't change behavior,
  including the create-Jira idempotency check (re-calling create on an
  already-linked item returns the existing issue, never a duplicate).
- New routes, both admin-gated the same way every other mutating route is
  (`requireAdminAuth()` — real Supabase session, not an API key):
  - `POST /api/roadmap/explain` — wraps `explainRoadmapItem`.
  - `POST /api/jira` — action-discriminated (`create` | `link` | `transition`),
    mirroring the existing `{action: "..."}` convention already used by
    `/api/ingest`.
- `POST /api/ingest {action:"sync_zendesk"}` gained an optional
  `analyze: boolean` field (default `false`, preserving prior behavior) that
  runs the Core Analysis Agent on newly-synced tickets and escalates
  high-risk ones in Zendesk — the same opt-in the MCP tool already had.
- UI: `components/dashboard/ExplainDialog.tsx` (first real usage of the
  previously-unused `components/ui/dialog.tsx`) and
  `components/dashboard/JiraActions.tsx`, both added to each roadmap kanban
  card in `Roadmap.tsx`; an "Also analyze new tickets" checkbox added to
  `IngestPanel.tsx`. Feedback stays inline status text under each
  button/control — no new toast library, matching the app's existing
  convention (`Admin.tsx`, `IngestPanel.tsx`).
- Card action buttons/inputs call `stopPropagation` on pointerdown/click so
  they don't trigger the kanban card's drag-and-drop handler.

## 2026-08-20 — Weekly Digest Agent: Vercel Cron + Resend email (`0febc4b` → `6408838`)

First push-based surface — the dashboard and every MCP tool are pull-based
(someone has to open the app or ask a question), so nothing surfaced
proactively when a new high-churn signal appeared or a roadmap item got
promoted. This adds an unattended Vercel Cron job (Monday 13:00 UTC,
`/api/cron/weekly-digest`) that emails a summary: top 5 churn risk items, top
5 pain points, roadmap items promoted to Now in the last 7 days, and this
week's escalation count.

- `lib/pipeline/digest.ts` builds the digest from `loadDashboardBundle()` (the
  same data-access function every other consumer uses), renders plain HTML,
  and sends via Resend with a weekly idempotency key (`weekly-digest/<date>`)
  so a Cron retry — or a manual re-trigger the same day — can't double-send.
  Degrades gracefully (`sent: false`, doesn't throw) if `RESEND_API_KEY`/
  `DIGEST_EMAIL_TO` aren't set, matching every other best-effort integration
  in this codebase.
- Cron auth follows the standard Vercel pattern: `Authorization: Bearer
  ${CRON_SECRET}`, which Vercel sends automatically on scheduled invocations.
- `vercel.ts` (new, typed) — this project had neither `vercel.json` nor
  `vercel.ts` before; per current Vercel guidance `vercel.ts` is the
  recommended format now, so that's what got added rather than
  `vercel.json`.
- **Resend was provisioned via the Vercel Marketplace CLI**
  (`vercel integration add resend --claim -m domain=... -m region=...`), per
  the `marketplace` skill's required categorize → discover → install → build
  flow — `vercel integration discover --category messaging` returned exactly
  one result (Resend), confirming the choice rather than assuming it. The
  integration required a domain-you-own at provisioning time; none was
  available, so it was provisioned with a placeholder (`example.com`) and
  sending currently runs in **Resend's sandbox mode**: from
  `onboarding@resend.dev`, deliverable only to the Resend account's own
  verified email. Verifying a real domain later removes that limit with zero
  code changes — the `from`/`to` logic doesn't change, only what Resend
  allows.
- Verified end-to-end against real production data before shipping: triggered
  the route locally with a real `CRON_SECRET`, confirmed a real email arrived
  with content matching the dashboard, confirmed 401 on missing/wrong auth,
  then after deploying confirmed the cron actually registered
  (`vercel crons list`) and triggered it live in production
  (`vercel crons run`) — got a 200, and the idempotency key correctly
  prevented a duplicate send for the same day.

## 2026-08-20 — MCP server: agent/extension interface with 10 tools (`ddaf9c7` → `11e2d76`)

Instead of building a second UI, wrapped CCPilot's existing backend as an
[MCP](https://modelcontextprotocol.io) server so Claude Desktop/Code can query
and act on churn risk, pain points, roadmap, and Jira/Zendesk directly from
natural language. `mcp-server/index.ts` registers all tools over stdio; `tsx`
runs it standalone (already a devDependency for `scripts/*.ts`), and
`tsconfig.json` already had `mcp-server` in its `exclude` list from before this
existed, so it doesn't touch the Next.js build.

The whole thing works because the backend functions it wraps are **pure**
(env vars + Supabase client, no Next.js request context) — `loadDashboardBundle`,
`createJiraIssue`, `fetchZendeskTickets`, `runCoreAnalysis` all import directly
with zero adaptation. The one place this broke down: `app/api/roadmap/route.ts`'s
`PATCH` handler is gated behind `requireAdminAuth()` (uses `next/headers`
`cookies()`), so its actual mutation logic (`createJiraForRoadmapItem`) is
duplicated into `mcp-server/tools/actions.ts` rather than called via the route —
a trusted local process doesn't need the browser-session auth check.

Tools, built across several passes (`ddaf9c7`, `459621d`, `51f34a3`, `a90b5c4`,
`11e2d76`):

- **Read**: `get_pain_points`, `get_churn_risk`, `get_live_analysis`,
  `get_roadmap` — each mirrors the exact sort/cap logic the dashboard
  components use, so an agent's answer matches what's on screen.
- **Write**: `create_jira_issue` (standalone ticket), `move_roadmap_item`
  (bucket move + auto-create-Jira-on-Now, same as dragging a card),
  `link_jira_issue` (attach an *existing* Jira key to a roadmap item without
  creating a new one — needed once `create_jira_issue` had already been used to
  file something standalone that later turned out to match a roadmap item),
  `transition_jira_issue` (move an issue to a target status by name, resolving
  the real transition ID from the issue's current workflow state — Jira
  transition IDs are workflow-specific, not something to hardcode), and
  `sync_zendesk` (fetch + upsert, mirrors the existing manual "Sync" action;
  deliberately does **not** run the Core Analysis Agent, which stays
  webhook-only, so a manual pull can't silently cascade into automated
  escalation).
- **Explain**: `explain_roadmap_item` — reconstructs the actual impact/effort
  scoring math behind a roadmap item's bucket, with `compare_to_id` for "why is
  A prioritized over B." Verified against real production data and caught a
  real bug in the process: bucket placement runs through an LLM judgment call
  first (`runRoadmap()` in `lib/pipeline/roadmap.ts`) and only falls back to
  the literal heuristic formula/thresholds when there's no API key or the call
  fails — so the formula doesn't always match the actual stored bucket. The
  first version of this tool asserted the formula's predicted bucket as fact,
  producing a visible self-contradiction ("in NOW... → NEXT") on a real item.
  Fixed to compute `formula_bucket` separately and reconcile mismatches against
  the real `bucket` instead of asserting one over the other. Also fixed a
  churn-weighting gap along the way: `features.ts`'s `avgChurnForCluster` is
  local-mode only and silently no-ops in Supabase/production — the explain tool
  re-derives churn risk in memory from `DashboardBundle` instead, mode-agnostic,
  without touching the live pipeline's actual scoring behavior.

Every write tool was smoke-tested against real production data before being
committed (a temporary `mcp-server/_verify.mts` script, deleted after each
check) — this caught the `explain_roadmap_item` bug above, and confirmed
`transition_jira_issue`'s error path lists valid statuses when given a bad one.

**Client registration, and a scoping bug**: added via `claude mcp add` (Claude
Code) and `claude_desktop_config.json`'s `mcpServers` block (Claude Desktop) —
these are two entirely separate configs; adding to one doesn't add to the
other, and a client only picks up a newly-registered/edited server on its next
session start, not live. First registration used `-s user` scope (available in
every project on the machine) by mistake; re-registered at `-s local` (private,
this project only) once caught. Claude Desktop has no per-project scoping at
all — that's a real platform limitation, not a config mistake, left as global
by explicit choice.

**Real usage this session**: filed `KAN-2` (standalone, Trackr/HubSpot churn
signal) and `KAN-3` (standalone, Flowdesk SSO docs churn signal) via
`create_jira_issue`, linked `KAN-3` to the matching "Self-Validating SSO/Okta
Setup Wizard" roadmap card via `link_jira_issue`, then found that
"Integration Field-Mapping & Deduplication Engine" (already on the roadmap in
Next) was the real fix for what `KAN-2` described — linked `KAN-2` to it and
moved it to Now (link-then-move order matters: `move_roadmap_item` only
auto-creates a new issue when none is linked yet, so linking first prevented a
duplicate). Resolved `KAN-2` via `transition_jira_issue` once done.

Also wrote up the general pattern (backend-as-MCP-server, pure-function
portability, read/write tool split, credential/config gotchas) as
`mcp-agent-interface/README.md` in the separate `skills-agents` repo, with all
CCPilot-specific identifiers (company names, project keys, domains, credential
values) stripped.

## 2026-08-20 — Dashboard polish: enlarge branding, top-10 caps, fix a sort (`098ea89`, `ba48078`, `41dbbbb`, `a58c571`, `6f31ead`)

Follow-up aesthetic/UX pass after the redesign below:

- Header: dropped the standalone "CCPilot" `h1` entirely and enlarged the
  small eyebrow label ("Customer Intelligence Copilot") into the main
  display heading, with a new multi-sentence description of what the
  product actually does underneath (the per-view contextual line stays,
  now as a third, smaller line).
- Sidebar: bumped the "CCPilot" logo text from `text-xl` to `text-3xl` (and
  its "Customer Intelligence" subtitle `text-xs` → `text-sm`) — it read as
  too small relative to everything else once the filter bar/nav buttons
  were removed and the sidebar got visually sparser.
- Pain Points, Churn Risk, Features, and Live Analysis all capped their
  list/table rendering to the top 10 (by severity, weighted churn score,
  impact score, and churn risk score respectively) instead of showing up
  to 40–100 rows. Each shows a small "Top 10 by …" label; Live Analysis
  keeps its stat tiles (Analyzed/Escalated/etc.) computed off the *full*
  filtered set, only the rendered list is sliced, so the summary numbers
  don't misleadingly shrink to match the visible 10.
- Fixed a real inconsistency found while doing the above: Churn Risk's
  "High-risk items" list was sorting by ticket date, not risk — the only
  one of the four not already sorted high-to-low by its severity-equivalent
  metric. Switched to sort by `weighted_score` descending.

## 2026-08-20 — Replace sidebar view-switcher and filter bar with a card nav (`2147f26`)

Aesthetic redesign: drop the sticky company/source/date/severity filter bar
(and its Reset button) entirely, and turn the sidebar's vertical
view-switcher buttons into a persistent grid of cards in the main content
area instead. Confirmed with the user first: cards are a permanent nav (not
a one-time landing screen), Admin/Pipeline stays visually demoted, and
sidebar keeps branding + Ingest/Zendesk sync + sign-in/out.

- `useFilters()`/`applyFilters()` are read by 6 different files (`ChurnRisk`,
  `PainPoints`, `LiveAnalysis`, `Clusters`, `AISuggestions` via
  `filterKey`, and server-side `app/api/suggestions/route.ts`). Rather than
  rip filtering out of all of them for what's really a UI-only ask, kept
  the plumbing and made its default state permanently "everything": widened
  `defaultFilters.dateFrom`/`dateTo` in `lib/filters/context.tsx` to
  `2000-01-01`/`2100-01-01`, and moved the real-company
  auto-registration effect (`registerCompanies` — see the filter-hiding bug
  below) out of the now-deleted `FilterBar.tsx` into
  `components/dashboard/DashboardProvider.tsx`, which is always mounted
  regardless of whether any filter UI exists. Without that move, real
  company names would've silently dropped out of view again with no way to
  bring them back.
- New `components/dashboard/ViewCardNav.tsx`: a responsive `Card` grid, one
  per view, active one ringed in teal, Admin/Pipeline muted. Replaces both
  the sidebar buttons and `MobileViewSelect` (deleted — the card grid
  reflows at every breakpoint on its own, no separate mobile nav needed).
- `SidebarNav.tsx` trimmed down to branding, `IngestPanel`, and the
  sign-in/out block — nothing else.
- Verified via headless Chrome screenshot before shipping: card nav renders
  correctly with the active/muted states, sidebar is minimal, no filter bar
  anywhere.

## 2026-08-20 — Auto-create Jira issues when a roadmap item moves to Now (`9f70d93`)

Roadmap suggestions never left CCPilot — engineers had no way to pick up a
"Now" item without someone manually copying it into Jira. Dragging a card
into **Now** now creates a real Jira issue automatically and links it back
on the card.

- New `lib/integrations/jira.ts` (`hasJiraCreds`, `createJiraIssue`) — same
  server-to-server pattern as the Zendesk OAuth client: direct REST API v3
  call (`POST /rest/api/3/issue`), Basic Auth via `email:apiToken` base64,
  no third-party middleman (Zapier/Make were considered and explicitly
  rejected in favor of this).
- `app/api/roadmap/route.ts`'s `PATCH` handler calls it best-effort
  (try/catch, logs and continues — never fails the bucket-move response)
  whenever the new bucket is `"now"` and the item doesn't already have a
  `jira_issue_key`, so re-dragging the same card doesn't create duplicates.
  `supabase/migrations/003_roadmap_jira.sql` adds `jira_issue_key`/
  `jira_issue_url` columns to `roadmap` to persist the link.
- **Two real misconfigurations hit and fixed during setup, not code bugs**:
  1. `JIRA_PROJECT_KEY` was initially set to the name of an **Atlassian
     Home "initiative" page** (Projects hub — About/Updates/Learnings/Risks
     tabs, no issue tracker), not an actual Jira Software project. Jira's
     API error for this ("target project doesn't exist or you don't have
     permission") is identical to a real permissions problem, so this took
     a few rounds of screenshots to diagnose. The real project (with an
     issue-tracking board) was found via the app-switcher → Jira → Spaces
     list, key `KAN`.
  2. `getAccessToken`'s OAuth scope in `zendesk-live.ts` was broadened from
     `tickets:read` to `tickets:read tickets:write` (shared with the
     Zendesk webhook's priority-escalation write-back, see below) —
     unrelated to Jira but landed in the same work.
- Verified end-to-end against the live Jira project: dragging a card into
  Now created `KAN-1`, card showed the linked badge, confirmed in both
  Jira and Supabase.

## 2026-08-20 — Add Live Analysis dashboard view + fix real feedback silently hidden by the company filter (`c512158`, `81ecfb5`)

- New `components/dashboard/LiveAnalysis.tsx` view surfacing
  `core_analysis` (see the Core Analysis Agent entry below) joined to
  `feedback_items`: sentiment badge, category, churn score (color-coded),
  escalation flag, primary pain point, expandable key quotes and
  recommendation. Sorted by churn risk descending. `lib/store/dashboard-data.ts`
  and `DashboardBundle` extended with a `coreAnalysis` array.
- **Found immediately after shipping**: triggered a real Zendesk comment,
  `core_analysis` had the row, but Live Analysis showed empty. Root cause —
  `lib/filters/context.tsx`'s default `companies` filter was a hardcoded
  3-name demo list (`Flowdesk`/`Trackr`/`NovaPulse`). The real ticket's
  Zendesk organization name (`"Asd"`, a test account) fell outside that
  list and got silently filtered out **everywhere in the dashboard**, not
  just Live Analysis — this bug predated Live Analysis and had just never
  surfaced before because all prior real-data testing happened to use
  demo-named companies. Fixed by having `FilterBar` (at the time) register
  every real company name seen in loaded data via a new
  `registerCompanies`/`knownCompanies` pair on the filter context, and
  auto-selecting all of them unless the user has manually customized the
  checkboxes. (This mechanism later moved into `DashboardProvider` when the
  filter bar itself was removed — see above.)

## 2026-08-20 — Add Zendesk webhook for the real-time Core Analysis Agent (`1828a0a`, `d53e81d`)

Built a second, real-time ingestion path alongside the existing batch
Zendesk sync: a webhook that runs a dedicated analysis agent on every new
ticket/comment as it arrives, instead of waiting for someone to click
"Sync Zendesk."

- **The agent**: `lib/pipeline/core-analysis.ts` (`runCoreAnalysis`) — a
  single-purpose Claude call (via the same `cachedJsonCompletion` the batch
  pipeline uses) that returns strict JSON: `sentiment`, `churn_risk_score`
  (0–1 float), `primary_pain_point`, `category`, `key_quotes`,
  `actionable_recommendation`, `zendesk_priority_escalation` (true when
  score ≥ 0.75 or a critical bug). Schema in
  `CoreAnalysisOutputSchema` (`lib/ingestion/schema.ts`); persisted to a new
  `core_analysis` table (`supabase/migrations/002_core_analysis.sql`), one
  row per feedback item.
- **The route**: `app/api/webhooks/zendesk/route.ts` — verifies the
  request, normalizes the ticket (`lib/ingestion/zendesk-webhook.ts`),
  saves it as a `feedback_item`, runs the agent, and if
  `zendesk_priority_escalation` is true, writes back to the real ticket:
  sets priority to urgent and adds a `churn_risk_flagged` tag.
- **Auth ended up as a bearer token, not HMAC signing**: originally built
  signature verification (`X-Zendesk-Webhook-Signature` HMAC-SHA256) per
  Zendesk's docs, but the signing secret isn't exposed on this account's
  webhook creation form (only on a detail-page tab in some
  accounts/versions). Switched to `Authorization: Bearer <token>` — a
  secret the user generates and controls directly, checked with a
  timing-safe comparison against `ZENDESK_WEBHOOK_SECRET`. The unused HMAC
  function is left in `zendesk-webhook.ts` in case the signing-secret path
  becomes available later.
- **Escalation tag didn't stick at first**: the initial priority-escalation
  write-back set `additional_tags` on the single-ticket `PUT
  /tickets/{id}.json` call — Zendesk silently ignores that field there;
  it's only honored on the bulk `update_many` endpoint. Priority changed
  fine (so it looked like it was working), but the tag never appeared.
  Fixed by splitting into two calls: the `PUT .../tickets/{id}.json` for
  priority, and a second `PUT .../tickets/{id}/tags.json` (which adds
  without clobbering existing tags) for the tag. Verified directly against
  the live Zendesk API before and after to confirm the exact failure mode.
- **A chain of deploy issues, not code bugs, delayed verification**:
  1. Zendesk's webhook Endpoint URL was typo'd `/api/webhook/zendesk`
     (singular) against the actual route `/api/webhooks/zendesk` (plural)
     → real 404s, visible in `vercel logs --json`.
  2. The direct `*.vercel.app` deployment URL returns Vercel's own
     Deployment Protection 401 ("Protected deployment") before any app code
     runs — easy to mistake for the app's own auth. `ccpilot.vercel.app`
     (the production alias) is unprotected and is the right URL to test
     against and give to Zendesk.
  3. **All of this code sat as uncommitted local changes** — the live
     Vercel deployment was still built from the last *pushed* commit, so
     the production alias gave a genuine 404 for a route that existed
     locally. `vercel cache purge` was tried first (a real red herring) and
     changed nothing, since there was no cache involved — the route
     literally didn't exist in any deployed build yet. Fixed by committing,
     pushing to `origin/master`, and running `vercel --prod --yes`
     manually — **this project has no GitHub-integration auto-deploy**,
     confirmed via `gh api repos/.../hooks` returning `[]`; every deploy
     this session was a manual `vercel --prod --yes` after pushing.
  4. The Zendesk trigger's two conditions (`Ticket is Created`, `Comment is
     Public`) were both under **"Meet ALL"** instead of **"Meet ANY"** —
     that combination only fires on a ticket's very first comment, never on
     a later comment added to an existing ticket. Moved both into the ANY
     group.
- Verified end-to-end against the live Zendesk trial account and Supabase:
  a real comment with churn language produced `churn_risk_score: 0.92`,
  `zendesk_priority_escalation: true`, and the ticket's priority + tag both
  updated in Zendesk.

## 2026-08-19 — Fix Vercel Data Cache silently serving stale Supabase reads

After the G2 purge (below), the live site kept returning the old,
pre-purge dataset (688 rows incl. G2) no matter what — while every direct
check against the database itself (raw REST curl, a plain Node script,
even the app's own `createServiceClient()` run locally) consistently and
correctly showed 463 rows with G2 gone. Spent a long time ruling out the
obvious suspects before finding the real cause:
- Confirmed `ccpilot.vercel.app` aliases to the actual latest deployment
  (`vercel inspect`) — not a stale alias.
- Confirmed `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` on
  Vercel Production byte-for-byte match `.env.local` (temporarily marked
  non-sensitive to `vercel env pull` and diff them, then restored to
  sensitive after) — not an env var mismatch.
- Confirmed `vercel deploy --prod --force` (bypasses the Build Cache) and
  a cache-busting query param made no difference — not the build cache,
  not a CDN edge cache (`x-vercel-cache: MISS` the whole time).
- Confirmed the response's own `mode: "supabase"` field, not `"local"` —
  not accidentally falling back to the gitignored `data/local-db.json`
  file some old local-mode testing had left on disk.

The actual cause: **Vercel's Data Cache** — a fetch-result cache that
persists *across deployments* and is separate from the Build Cache
`--force` bypasses. `export const dynamic = "force-dynamic"` alone did
not reliably stop it from caching the Supabase JS client's internal
`fetch()` calls. Fixed by adding `export const fetchCache =
"force-no-store"` alongside `dynamic = "force-dynamic"` in all 5
`app/api/*/route.ts` files — the stronger, Next.js-documented directive
that forces every fetch in the route (including ones made deep inside a
third-party library) to bypass the Data Cache outright. Verified stable
across multiple fresh requests after redeploying.

**Lesson for next time a Vercel deployment looks "stuck" on old data**:
`dynamic = "force-dynamic"` is not always sufficient on its own — add
`fetchCache = "force-no-store"` too, especially for routes that call a
third-party client library (Supabase, etc.) rather than `fetch()`
directly.

## 2026-08-19 — Remove G2 entirely; dynamic per-section headline; sign-in visibility

G2 required a Partner API account the user doesn't have, so removed it
completely rather than just the live-sync feature:
- Deleted `lib/ingestion/g2-csv.ts`, the whole `/mcp-server` package, the 3
  G2 sample CSVs, the "Sync G2" button/handler, and the `sync_g2` action in
  `app/api/ingest/route.ts`.
- Dropped `g2` from `FeedbackSourceSchema`, `FeedbackSource` type, and the
  `SOURCES` filter array — G2 is no longer a selectable/valid source
  anywhere in the app.
- Purged the 225 existing G2 rows from `feedback_items` in Supabase
  (cascades to `pain_points`/`churn_signals`/`feedback_clusters` via FK).
  Re-ran cluster → features → roadmap so derived data reflects only
  Play Store + Tickets.
- **Found and fixed a real pre-existing bug while re-running the
  pipeline**: `loadFeatures()` in `lib/pipeline/roadmap.ts` didn't filter
  by the latest cluster run in Supabase mode (unlike local mode, which
  did) — features from every past cluster run accumulate in the table by
  design, so roadmap generation was silently feeding Claude a growing pile
  of stale features from superseded runs. This surfaced as a real 500
  (`duplicate key value violates unique constraint
  "roadmap_feature_id_run_id_key"`) once two different-run features
  happened to share an identical `feature_name`. Fixed by scoping the
  Supabase-mode query to the latest cluster run's `cluster_id`s, matching
  the pattern `lib/pipeline/features.ts`/`lib/store/dashboard-data.ts`
  already used correctly.
- Removed `G2_API_KEY`/`G2_PRODUCT_ID` from `.env.local`,
  `.env.local.example`, and all three Vercel environments.
- Local/prod share one Supabase project, so the data purge applied to the
  live site immediately — no separate prod migration needed.

Also, per feedback on the dashboard redesign:
- The top "CCPilot" header's subtitle is now dynamic per active view
  (`VIEW_HEADLINES` in `app/page.tsx`) instead of one static sentence that
  never changed regardless of which section was open.
- The sidebar's "Sign in" link was a barely-visible 10px text link —
  changed to a full-width solid button matching the rest of the sidebar's
  button sizing.

## 2026-08-19 — Replace shared ADMIN_TOKEN with real Supabase Auth login (`ca4a94f`)

The static `ADMIN_TOKEN` worked but was annoying in practice — a random hex
string with nowhere obvious to look it up, pasted into a `window.prompt()`
each session. Replaced with real Supabase Auth (email/password), using the
same Supabase project this app already runs on (no new service).

- Added `@supabase/ssr`, `lib/supabase/auth-browser.ts`/`auth-server.ts`
  (cookie-backed clients, kept separate from the existing data-access
  `lib/supabase/client.ts`), `middleware.ts` (session refresh via the
  JWT-verified `getClaims()`, not the unverified `getSession()`), and
  `app/login/page.tsx`.
- `lib/auth/admin.ts`'s `requireAdminAuth()` now checks the session instead
  of a header token — same call shape at every route, so
  `app/api/{ingest,pipeline,roadmap,suggestions}/route.ts` only needed an
  `await` added, no logic changes.
- `lib/auth/admin-client.ts`'s `adminFetch` drops the prompt/sessionStorage
  token entirely — redirects to `/login` on 401 instead.
- Created the admin's actual Supabase Auth account via
  `supabase.auth.admin.createUser()` (service-role, one-off script).
- Removed `ADMIN_TOKEN` from `.env.local`, `.env.local.example`, and all
  three Vercel environments.
- **Version gotcha worth remembering:** current Supabase docs default to
  Next.js's newer `proxy.ts` middleware convention — this project pins
  Next 14.2.35, which only recognizes `middleware.ts`/`export function
  middleware`. Copying the docs' file name verbatim would have silently
  done nothing.
- Verified end-to-end (Playwright): 401 without a session, login sets the
  `sb-*-auth-token` cookie and redirects to `/`, authenticated admin
  actions (sync, pipeline re-run) succeed with zero redirects and zero
  console errors, sidebar renders the signed-in email.

## 2026-08-19 — Sidebar ingest panel + fix broken Tailwind v4 `data-*` variants (`9b3287a`, `ce92ede`)

Follow-up bug reports on the redesign:
- Cards had almost no padding — `card.tsx` (and `select.tsx`/
  `dropdown-menu.tsx`) used Tailwind v4-only syntax (`px-(--card-spacing)`,
  `[--card-spacing:--spacing(4)]`) that Tailwind v3.4.1 (what this project
  actually runs) doesn't parse, so the utilities silently produced no CSS.
  Fixed by switching to v3-valid `var()` bracket syntax.
- The severity range slider showed as "2 floating radio buttons" — same
  root cause, one level deeper: `data-horizontal:`/`data-vertical:`/
  `data-checked:`/`data-disabled:`/`data-open:`/`data-closed:` are bare
  Tailwind v4 variant shorthands with no v3 equivalent; v3 needs the
  bracket form (`data-[orientation=horizontal]:`, `data-[state=checked]:`,
  etc.). This silently broke Slider's track/range fill (only the thumbs
  rendered), Checkbox's checked-state fill, Separator's height/width, and
  Sheet/Select's open/closed transition classes. Fixed all of them —
  `tabs.tsx`/`scroll-area.tsx`/`dialog.tsx`/`dropdown-menu.tsx`'s remaining
  instances were left alone since none of those components are used
  anywhere in `components/dashboard/`.
- CSV upload and G2/Zendesk sync were buried inside the Admin view, only
  reachable after switching to it. Moved to a new always-visible
  `IngestPanel` in the sidebar; Admin now holds only cluster controls +
  the pipeline stage table.

## 2026-08-19 — Consolidate dashboard into a single-view, clean minimal layout (`16d1500`)

The dashboard read as dense/scattered: all 7 sections (AI Suggestions, Pain
Points, Churn Risk, Clusters, Features, Roadmap, Admin) stacked full-width
in one long scroll, each hand-rolling near-identical but inconsistent
card/table markup, with 5+ competing accent colors and no shared component
— `components/ui/card.tsx`/`table.tsx`/`tabs.tsx` were installed but unused
anywhere in `components/dashboard/`.

- Sidebar is now a real view switcher (`ViewProvider`/`useView`) instead of
  anchor links — one section renders at a time. Admin visually demoted
  (separator + muted styling) since it's operator-only.
- Added `MobileViewSelect` (shadcn `Select`) — the sidebar previously just
  vanished below `lg` with zero nav fallback.
- New `components/dashboard/shared/{SectionHeader,StatGrid}.tsx` replace
  duplicated header/stat-tile markup across all 7 sections.
- Every ad hoc card/table div migrated onto shadcn `Card`/`Table`.
- One semantic color mapping applied everywhere via new
  `lib/dashboard/theme.ts` + updated `globals.css` chart vars: teal=brand/
  positive, terracotta=attention/medium, red=critical only, navy=sidebar
  chrome only (removed from charts), slate=neutral. Cut a floating amber
  accent and an untracked blue "Medium" priority color. 5 stray background
  tones consolidated to page/card/one muted surface. Dropped ChurnRisk's
  dead "vs prior period: —" placeholder.
- Handler logic (filters, `adminFetch` calls, drag-and-drop, CSV export)
  untouched — JSX/className/color only. Verified via headless Chromium
  screenshots of all 7 views + mobile, zero console errors, filter
  toggling/cluster drill-in/roadmap columns all still working.

## 2026-08-19 — Wire up live Zendesk ticket sync

Added a real Zendesk connector (`lib/ingestion/zendesk-live.ts`), triggered
via Admin → "Sync Zendesk" (`POST /api/ingest` `{action: "sync_zendesk"}`,
admin-token gated per the auth work above).

Getting a working credential took a few detours worth recording:
- Static Zendesk API tokens didn't work — turned out **new Zendesk accounts
  (created on/after 2026-07-28) can't create API tokens at all**; Zendesk is
  retiring them account-wide by 2027-04-30 in favor of OAuth. The UI shows a
  migration notice instead of the "Add API token" button on new accounts.
- The obvious next step (an OAuth **authorization_code** flow, which is what
  a redirect-URI-based setup implies) is the wrong grant for a backend
  service — it's for delegating access on behalf of an interactive user and
  needs a browser round-trip.
- The correct flow for a headless integration is **client_credentials**: a
  **Confidential** OAuth client (Admin Center → APIs → OAuth clients, no
  redirect URL needed) exchanged via `POST /oauth/tokens` with
  `grant_type=client_credentials` for a short-lived (~30 min) bearer token.
  No browser, no user approval step.

Verified end-to-end against the live trial account — fetched Zendesk's
seeded sample ticket, normalized it, and upserted into Supabase
(`feedback_items`, confirmed via direct query and the dashboard). Reuses the
existing `saveFeedbackItems`/`validateFeedback` pipeline, same as CSV
uploads. `ZENDESK_SUBDOMAIN`/`ZENDESK_CLIENT_ID`/`ZENDESK_CLIENT_SECRET` set
in `.env.local` and Vercel (all environments).

(Also hit a red herring while verifying: `/api/dashboard` showed 675 items
instead of 676 right after the sync, even after a full dev-server restart —
turned out to be a stale Next.js `.next/cache` fetch-cache entry from an
earlier session, not a real bug. `rm -rf .next` fixed it.)

## 2026-08-19 — Fix G2 integration to match the real Partner API v2

The repo's original G2 connector (`mcp-server/tools/fetch-g2-reviews.ts`,
`mcp-server/lib/normalize.ts`) was built against a **fictional API shape** —
`https://data.g2.com/api/v1/reviews` with `Authorization: Token token=...`,
page-number pagination, and `attributes.body`/`attributes.rating`/
`attributes.reviewer` fields that don't exist on the real API.

Given a real `G2_API_KEY` to test with, confirmed via direct `curl` against
G2's actual docs/OpenAPI spec (`https://data.g2.com/openapi/v2.yaml`) that
the real shape is:
- `GET https://data.g2.com/api/v2/products/{product_id}/reviews`
- `Authorization: Bearer <G2_API_KEY>` (the `AccountAPIToken` security scheme
  is HTTP bearer, not `Token token=`)
- Cursor pagination (`page[size]` + follow `links.next`), not page numbers
- Review fields: `title`, `answers` (unstructured Q&A object — no fixed
  schema, so `normalizeG2ApiReview` now flattens every string leaf), already
  1–5 `star_rating` (not `/10`), `submitted_at`, `product_name`, `url`; no
  `body` or `reviewer` attributes — reviewer info comes from the `included`
  array via `?include=user`
- **A valid key with no G2-side data subscription for the product returns
  `403`, not an auth error** — the key I was given authenticates fine
  (`Bearer` → `200` on `/api/v2/products`, empty result set) but has no
  product subscription yet, so live review data isn't fetchable until one is
  granted on G2's side.

Also fixed the same Node < 22 WebSocket gap (see 2026-08-18 entry below) in
`mcp-server/lib/supabase.ts`'s independent Supabase client — mcp-server is
pure ESM (`"type": "module"`), so this needed `createRequire(import.meta.url)`
rather than the main app's bare `require()`.

Rewrote `mcp-server/lib/normalize.ts`, `mcp-server/tools/fetch-g2-reviews.ts`,
`mcp-server/lib/supabase.ts`, and updated `mcp-server/README.md`/
`ARCHITECTURE.md` to document the real shape. Verified end-to-end against the
live API with a placeholder `product_id` — clean `404`/error handling, no
crash, no bad data written; can't verify real review ingestion until a
product data subscription exists. `G2_API_KEY` set in `.env.local` and Vercel
(production/preview/development).

## 2026-08-18 — Admin token gate on mutating routes (`aa86485`)

The dashboard is live at https://ccpilot.vercel.app with real, billed
Anthropic/Voyage/Supabase keys and had zero auth — anyone with the URL could
trigger paid Claude/Voyage calls or mutate live data.

- New `lib/auth/admin.ts` (server): `requireAdminAuth` compares a
  `x-admin-token` header against `ADMIN_TOKEN` via `crypto.timingSafeEqual`.
- New `lib/auth/admin-client.ts` (client): `adminFetch` prompts once for the
  token, stores it in `sessionStorage`, retries once after a 401.
- Gated: `POST /api/ingest`, `POST /api/pipeline`, `PATCH /api/roadmap`, and
  `POST /api/suggestions` (only when `force: true`).
- Left public: `GET /api/dashboard`, `GET /api/pipeline`, and the automatic
  non-force suggestions fetch on page load — so the dashboard still works as
  a passive read-only demo link for anyone.
- `ADMIN_TOKEN` (random 32-byte hex) set in `.env.local` and Vercel
  production/preview/development. Verified 401/200 behavior both locally and
  against the live deployment.

## 2026-08-18 — Raise pipeline `max_tokens` to 4096 (`c03f7b9`)

`/api/suggestions` was failing on the live dashboard with a JSON parse error.
Root cause: `cachedJsonCompletion`'s `max_tokens: 1024` truncated the
response mid-JSON once real (verbose, Claude-generated) feature names were in
the prompt instead of short placeholders. Confirmed by reproducing locally
against the live Supabase feature set (866 output tokens for 5 suggestions).

## 2026-08-18 — Deployment fixes + pipeline concurrency (`46aa819`, `65d6749`)

Three issues surfaced running the pipeline against real Supabase + Claude on
Vercel:

- `claude-sonnet-4-20250514` (hardcoded default model) was retired — every
  Claude call 404'd. Switched to `claude-sonnet-5`.
- Node 20 (local dev machine) has no global `WebSocket`, which
  `@supabase/realtime-js` requires even though this app never subscribes to
  realtime. Patched `lib/supabase/client.ts` to pass the `ws` package as
  transport only when `WebSocket` is undefined.
- `runPainPoints`/`runChurn` looped one Claude call at a time over all 675
  feedback items (sequential, ~25–70 min). Added `lib/pipeline/concurrency.ts`
  (`mapWithConcurrency`, limit 10) and used it in both stages — cut pipeline
  runtime dramatically.

## 2026-08-18 — Initial deploy (`b4e8677` + Vercel setup)

Committed the full app (ingestion, 5-stage Claude pipeline, dashboard UI,
G2 MCP server, sample data, docs) and deployed to Vercel:
- Project linked as `subbu0396s-projects/ccpilot`.
- Supabase credentials + `ANTHROPIC_API_KEY`/`VOYAGE_API_KEY` set as Vercel
  env vars (production/preview/development).
- Applied `supabase/migrations/001_init.sql`, loaded sample data, ran the
  full pipeline against live Supabase.
- Live at https://ccpilot.vercel.app.
