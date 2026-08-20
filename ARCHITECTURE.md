# Architecture — Customer Intelligence Copilot

## Overview

Ingest customer feedback from **Play Store** and **Support Tickets**, normalize into one schema, run a five-stage Claude analysis pipeline, and present everything on a single interactive dashboard.

```
CSV / batch sync ──► feedback_items (Supabase + pgvector) ◄── Zendesk webhook
                    │                                              │
                    ▼                                              ▼
         Postgres job queue (pipeline_jobs)              Core Analysis Agent
                    │                                              │
    ┌───────────────┼───────────────┐                              ▼
    ▼               ▼               ▼                       core_analysis
 pain_points   churn_signals   embeddings                          │
    │               │               │                    escalate? ──► Zendesk
    └───────────────┴──────► k-means clusters             (priority + tag)
                                │
                                ▼
                            features
                                │
                                ▼
                             roadmap ──► drag to Now ──► Jira issue
                                │
                                ▼
                     Unified dashboard (/)
```

Two parallel paths write into `feedback_items`: the batch pipeline above
(CSV upload / manual "Sync Zendesk") and the real-time Zendesk **webhook**,
which additionally runs a dedicated single-item agent (not the 5-stage
pipeline) and can write back into Zendesk on high churn risk. See "Real-time
analysis" below.

A third, separate consumer of this same data: `mcp-server/` exposes it as
tools for Claude Desktop/Code (an agent/chat interface alongside the
dashboard, not instead of it). See "MCP server" below.

## Shared schema

Every source normalizes immediately on ingest:

| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid | Internal |
| `source` | `playstore \| ticket` | |
| `company` | string | Multi-company filter (Flowdesk / Trackr / NovaPulse) |
| `text` | string | Primary content |
| `rating` | number \| null | 1–5 when available |
| `timestamp` | ISO | |
| `customer_id` | string \| null | |
| `metadata` | jsonb | Source-specific extras |
| `external_id` | string \| null | Dedup key with `(source, company)` |

## Source adapters

| Source | Path | Live API hook |
|--------|------|---------------|
| Play Store | `/lib/ingestion/playstore.ts` | Swap CSV parser for Google Play Developer API |
| Tickets | `/lib/ingestion/tickets.ts` (CSV) + `/lib/ingestion/zendesk-live.ts` (live) | Zendesk live sync wired up (OAuth client_credentials); Freshdesk still CSV-only |

> G2 was removed (2026-08-19) — it required a G2 Partner API account this
> project doesn't have. See `NOTES.md` if you want to re-add a source that
> needs an API key you don't yet have: build and verify the connector code,
> but don't wire it into the live UI until you actually have credentials.

### Zendesk live sync

`lib/ingestion/zendesk-live.ts` fetches tickets via `GET /api/v2/tickets.json` and normalizes them, triggered from Admin → "Sync Zendesk" (`POST /api/ingest` with `{action: "sync_zendesk"}`, admin-token gated).

Auth is **OAuth 2.0 client credentials** (`POST /oauth/tokens`, `grant_type=client_credentials`), not a static API token — Zendesk blocked new API-token creation for accounts created on/after 2026-07-28 and is fully retiring them by 2027-04-30. Create a **Confidential** OAuth client in Admin Center → Apps and integrations → APIs → OAuth clients (no redirect URL needed for this grant type); the client's Identifier/Secret become `ZENDESK_CLIENT_ID`/`ZENDESK_CLIENT_SECRET`. The access token is short-lived (~30 min) and cached in-memory per process, re-fetched automatically on expiry. Scope is `tickets:read tickets:write` — write is needed for the priority-escalation write-back described below, shared via the same `getAccessToken` helper.

## Real-time analysis (Core Analysis Agent)

Separate from the 5-stage batch pipeline: `app/api/webhooks/zendesk/route.ts` receives a webhook call on every new ticket or public comment and runs a single-purpose agent (`lib/pipeline/core-analysis.ts`, `runCoreAnalysis`) immediately, no waiting for a manual "Sync Zendesk" or pipeline re-run.

- **Trigger**: a Zendesk trigger (Admin Center → Objects and rules → Triggers) with conditions `Ticket is Created` **OR** `Comment is Public` (must be in the "Meet ANY" group — "Meet ALL" only fires on a ticket's first comment) calls an active webhook (Admin Center → Apps and integrations → Webhooks) pointed at `/api/webhooks/zendesk`, with a JSON body template mapping ticket fields (id, subject, description, requester, organization, tags, priority, a custom `customer_tier` field if you have one) into the payload shape `lib/ingestion/zendesk-webhook.ts` expects.
- **Auth**: a bearer token (`Authorization: Bearer <token>`, verified with a timing-safe comparison against `ZENDESK_WEBHOOK_SECRET`) — chosen over HMAC signature verification because the signing secret isn't exposed on this account's webhook creation form. `verifyZendeskSignature` (HMAC) is still in `lib/ingestion/zendesk-webhook.ts`, unused, in case that path opens up later.
- **The agent**: strict-JSON output (`CoreAnalysisOutputSchema`, `lib/ingestion/schema.ts`) — `sentiment`, `churn_risk_score` (0–1 float), `primary_pain_point`, `category`, `key_quotes`, `actionable_recommendation`, `zendesk_priority_escalation` (true when score ≥ 0.75 or a critical bug). Persisted one row per feedback item in `core_analysis` (`supabase/migrations/002_core_analysis.sql`).
- **Escalation write-back**: when `zendesk_priority_escalation` is true, the route sets the ticket to `urgent` priority (`PUT /tickets/{id}.json`) and adds a `churn_risk_flagged` tag via a **separate** call to `PUT /tickets/{id}/tags.json` — Zendesk silently ignores `additional_tags` on the single-ticket update endpoint (it's only honored on the bulk `update_many` endpoint), so the tag needs its own request. Both are best-effort: failures are logged, never fail the webhook response.
- **Dashboard**: `components/dashboard/LiveAnalysis.tsx` surfaces `core_analysis` joined to `feedback_items`, sorted by churn risk, capped to the top 10 in the rendered list (stat tiles still reflect the full filtered set).

This project has **no GitHub-integration auto-deploy on Vercel** (confirmed via `gh api repos/.../hooks` returning `[]`) — every change needs `git push` **and** a manual `vercel --prod --yes` to actually go live; pushing to GitHub alone does nothing.

## Jira integration

Dragging a roadmap card into **Now** (`PATCH /api/roadmap`) auto-creates a real Jira issue via `lib/integrations/jira.ts` (`hasJiraCreds`, `createJiraIssue`) — direct REST API v3 (`POST /rest/api/3/issue`) with Basic Auth (`email:apiToken`), the same server-to-server pattern as the Zendesk OAuth client, no Zapier/Make in between. Best-effort (try/catch, logs and continues) and short-circuits if the roadmap row already has a `jira_issue_key`, so re-dragging the same card doesn't create duplicates. `JIRA_BASE_URL`/`JIRA_EMAIL`/`JIRA_API_TOKEN`/`JIRA_PROJECT_KEY`/`JIRA_ISSUE_TYPE` (optional, defaults to `Task`) in env. `JIRA_PROJECT_KEY` must be an actual Jira Software/Work Management project's key (visible in Jira's Spaces/Projects list, e.g. `KAN`) — not an Atlassian Home "initiative" page, which looks similar in the UI but has no issue tracker and returns the same permissions-style error from the API either way.

## MCP server (agent interface)

`mcp-server/` is a second, much thinner consumer of the same backend the
dashboard uses — a local [MCP](https://modelcontextprotocol.io) server (stdio
transport, `mcp-server/index.ts`, run via `npm run mcp` / `tsx`) that exposes
10 tools to Claude Desktop/Code, so churn risk, pain points, roadmap, and
Jira/Zendesk are queryable and actionable from natural language instead of
only through the dashboard UI. It's excluded from the Next.js build
(`tsconfig.json`'s `exclude`) and has its own minimal `tsconfig.json`.

This only works cheaply because it wraps **pure** functions — no new logic,
no duplicated data access:

- Read tools (`get_pain_points`, `get_churn_risk`, `get_live_analysis`,
  `get_roadmap`) call `loadDashboardBundle()` (`lib/store/dashboard-data.ts`)
  and mirror the dashboard components' own sort/cap logic, so an agent's
  answer matches what's on screen.
- Write tools call the same integration functions the app uses:
  `create_jira_issue`/`link_jira_issue`/`transition_jira_issue` wrap
  `lib/integrations/jira.ts`; `sync_zendesk` wraps
  `lib/ingestion/zendesk-live.ts` + `lib/store/feedback.ts`; `move_roadmap_item`
  duplicates `app/api/roadmap/route.ts`'s bucket-move + Jira-auto-create logic
  (not calling the route itself, since it's gated behind `requireAdminAuth()`,
  a browser-session check a trusted local process doesn't need).
- `explain_roadmap_item` recomputes the actual impact/effort scoring trail
  (`score = impact_score / EFFORT_MAP[effort_estimate]`, the real now/next/later
  thresholds from `lib/pipeline/roadmap.ts`) and reconciles it against the
  item's real stored bucket — bucket placement runs through an LLM judgment
  call first and only falls back to the pure formula without an API key, so
  the two can legitimately disagree; the tool explains the mismatch rather
  than asserting the formula as fact. It also re-derives cluster churn risk
  in-memory from the loaded bundle rather than reusing
  `features.ts`'s `avgChurnForCluster`, which is local-mode only and silently
  no-ops in Supabase/production.

**Client setup**: registered separately in Claude Code (`claude mcp add`,
scoped `-s local` — private to this project directory, not `-s user`) and
Claude Desktop (`claude_desktop_config.json`'s top-level `mcpServers` block —
must be top-level, not nested under `preferences`). These are independent
configs; a client only loads a newly added/edited server on its next session
start. Claude Desktop has no per-project scoping — any server registered
there is available in every conversation, by platform design, not a fixable
config detail.

See `mcp-server/README.md` for the full tool table and setup instructions.

## Weekly Digest Agent

The first **push-based** surface — everything else (dashboard, MCP tools) is
pull. `app/api/cron/weekly-digest/route.ts`, triggered by Vercel Cron
(`vercel.ts`, `0 13 * * 1` — Monday 13:00 UTC), emails a summary: top 5 churn
risk items, top 5 pain points, roadmap items promoted to Now in the last 7
days, and this week's escalation count.

- `lib/pipeline/digest.ts` builds the content from `loadDashboardBundle()`
  (same data-access function as everything else), renders plain HTML, sends
  via Resend with a weekly idempotency key (`weekly-digest/<date>`) so a Cron
  retry can't double-send.
- The route is gated by `Authorization: Bearer ${CRON_SECRET}` — Vercel sends
  this automatically on scheduled invocations, the standard protection
  pattern (otherwise anyone who finds the URL could trigger it).
- Resend is provisioned via the Vercel Marketplace (`vercel integration add
  resend`), not a hand-wired SDK call with an invented key. No custom domain
  is verified yet, so sending runs in Resend's **sandbox mode** — only from
  `onboarding@resend.dev`, only to the Resend account's own verified email.
  Verifying a real domain later lifts this with no code change.
- `vercel.ts` is this project's cron/config file — the current recommended
  format (typed, replaces `vercel.json`); there was neither before this.

## Pipeline design

Stages are **independently re-runnable** and **idempotent** (each overwrites only its own tables/columns):

1. **Pain points** — Claude extracts summary, severity, sentiment, product area → `pain_points`
2. **Churn** — Claude classifies risk + signal type; tickets 2×, 1–2★ 1.5× → `churn_signals`
3. **Cluster** — Voyage embeddings → pgvector; `ml-kmeans` (default k=8); Claude labels → `clusters`
4. **Features** — 1–3 features per cluster with impact/effort → `features`
5. **Roadmap** — Now / Next / Later by impact÷effort → `roadmap`

All Claude system prompts use **Anthropic prompt caching** to control cost at scale.

When `ANTHROPIC_API_KEY` / `VOYAGE_API_KEY` are absent, the pipeline runs in **heuristic demo mode** so the portfolio demo stays fully interactive.

Pain-points and churn (one Claude call per feedback item, up to 675 items) run with **bounded concurrency** via `lib/pipeline/concurrency.ts` (`mapWithConcurrency`, 10 in flight) rather than one call at a time — cluster/features/roadmap loop per-cluster (≤16) so they don't need it.

## Local vs Supabase

If `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set, data lives in Supabase (apply `supabase/migrations/001_init.sql` first).

Otherwise the app uses `data/local-db.json` so you can demo without cloud credentials. Set `USE_LOCAL_STORE=1` to force local mode.

## Extending to a new source

1. Add a parser in `/lib/ingestion/<source>.ts` that returns `NormalizedFeedback[]`
2. Register it in the admin upload UI and `scripts/load-sample-data.ts`
3. Optionally add an MCP tool if the source has an API worth exposing to agents
4. No pipeline changes required — stages read `feedback_items` only

## Dashboard

Single-page app (`/`) with one section rendering at a time: AI Suggestions, Pain Points, Churn, Live Analysis, Clusters, Features, Roadmap, or Admin. Navigation is a persistent card grid (`ViewCardNav`, `components/dashboard/ViewCardNav.tsx`) in the main content area — one `Card` per view, active one ringed in teal, Admin/Pipeline visually muted (operator-only, not a peer analyst view). Responsive at every breakpoint on its own; there is no separate mobile nav. View state itself is still `ViewProvider`/`useView` (`components/dashboard/ViewProvider.tsx`).

There is **no visible filter UI** — the company/source/date/severity filter bar was removed as part of an aesthetic redesign. The filter context/plumbing (`lib/filters/context.tsx`, `applyFilters` in `lib/dashboard/utils.ts`) still exists internally, since 6 files read it (`ChurnRisk`, `PainPoints`, `LiveAnalysis`, `Clusters`, `AISuggestions`'s cache `filterKey`, and server-side `app/api/suggestions/route.ts`), but its default state now permanently resolves to "everything": the date range is a wide fixed window, sources are the full enum, severity is the full 1–5 range, and companies auto-register from whatever's actually in the loaded data (`DashboardProvider.tsx` calls `registerCompanies` on every data refresh) rather than a hardcoded demo list. If you ever need to reintroduce filtering UI, that's the context to build against — don't re-derive it.

Pain Points, Churn Risk, Features, and Live Analysis each cap their rendered list to the **top 10** by their severity-equivalent metric (pain-point severity, churn weighted score, feature impact score, churn risk score) — a summary label above each list/table says which sort and, for Pain Points, how many matched if fewer than 10.

Shared presentational components live in `components/dashboard/shared/` (`SectionHeader`, `StatGrid`) and every section is built on the shadcn `Card`/`Table` primitives (`components/ui/`) rather than ad hoc markup, so spacing/radius/shadow stay consistent. Chart colors are centralized in `lib/dashboard/theme.ts` (mirrors the `--chart-1..5` CSS vars in `app/globals.css`) with one semantic mapping: teal = brand/positive, terracotta = attention/medium, red = critical only, slate = neutral. Navy is reserved for sidebar chrome and never appears in data viz.

The sidebar (`SidebarNav`) is now minimal: CCPilot branding, `IngestPanel` (CSV upload + Zendesk sync), and sign-in/out — no navigation lives there anymore.

**Tailwind version note:** this project runs Tailwind v3.4.1. The installed shadcn `components/ui/` primitives were originally generated for Tailwind v4 and used v4-only syntax (`px-(--var)`, `data-open:`, `data-checked:`, etc.) that v3 silently fails to parse — no error, just missing CSS. Several of these were found and fixed (card, slider, checkbox, separator, sheet, select, dropdown-menu var-syntax). If a shadcn component looks unstyled or a state variant (hover/open/checked/disabled) doesn't visually apply, check for bare `data-x:`/`-(--var)` syntax first — the fix is the v3 bracket form (`data-[state=x]:`, `[var(--x)]`).

## Auth

Single-admin model backed by **Supabase Auth** (email/password) — no separate token to distribute. Every **read** route (`GET /api/dashboard`, `GET /api/pipeline`, and the automatic on-load `POST /api/suggestions` with `force: false`) is public, so the dashboard works as a passive demo link for anyone. Every **mutating / spend-triggering** route requires a signed-in session:

| Route | Gated when |
|-------|------------|
| `POST /api/ingest` | always (CSV upload, Zendesk sync) |
| `POST /api/pipeline` | always (re-runs a pipeline stage — real Claude/Voyage spend) |
| `PATCH /api/roadmap` | always (drag-and-drop bucket override) |
| `POST /api/suggestions` | only when `force: true` (the "Regenerate" button — bypasses cache, real Claude spend) |

`POST /api/webhooks/zendesk` is a separate case: it's called by Zendesk, not a signed-in user, so it can't use the Supabase-session pattern above. It's gated instead by a bearer token (`Authorization: Bearer <token>`, timing-safe compared against `ZENDESK_WEBHOOK_SECRET`) — see "Real-time analysis" above.

- `lib/supabase/auth-browser.ts` / `auth-server.ts` — cookie-backed Supabase clients (`@supabase/ssr`), separate from `lib/supabase/client.ts` (the data-access client, which never touches auth/cookies).
- `middleware.ts` — refreshes the session cookie every request via `getClaims()` (JWT-verified). Uses Next 14's `middleware.ts`/`export function middleware` convention — this project pins Next 14.2.35, not the `proxy.ts` convention newer Next versions/docs now show.
- `lib/auth/admin.ts` — `requireAdminAuth()` checks the Supabase session server-side (no more static-token comparison).
- `lib/auth/admin-client.ts` — client-side `adminFetch`: session cookie is sent automatically; on a 401 it redirects to `/login` instead of prompting for anything.
- `app/login/page.tsx` — email/password sign-in form. Sidebar shows the signed-in email + sign-out, or a "Sign in" link.
- Admin/Roadmap-drag/Regenerate **UI stays fully visible** to everyone — only the underlying fetch is gated (hiding controls client-side would be security theater, and a portfolio visitor should still see the surface exists).
- To add/reset the admin account: Supabase Dashboard → Authentication → Users, or `supabase.auth.admin.createUser({ email, password, email_confirm: true })` via the service-role client.

## Deployment

Live at **https://ccpilot.vercel.app** (Vercel project `subbu0396s-projects/ccpilot`), backed by Supabase (not local-JSON mode) with real `ANTHROPIC_API_KEY`/`VOYAGE_API_KEY`. See [`NOTES.md`](./NOTES.md) for the running change log of what's shipped since the initial build.
