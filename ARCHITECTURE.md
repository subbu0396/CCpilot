# Architecture — Customer Intelligence Copilot

## Overview

Ingest customer feedback from **Play Store**, **G2**, and **Support Tickets**, normalize into one schema, run a five-stage Claude analysis pipeline, and present everything on a single interactive dashboard.

```
CSV / MCP ──► feedback_items (Supabase + pgvector)
                    │
                    ▼
         Postgres job queue (pipeline_jobs)
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
 pain_points   churn_signals   embeddings
    │               │               │
    └───────────────┴──────► k-means clusters
                                │
                                ▼
                            features
                                │
                                ▼
                             roadmap
                                │
                                ▼
                     Unified dashboard (/)
```

## Shared schema

Every source normalizes immediately on ingest:

| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid | Internal |
| `source` | `playstore \| g2 \| ticket` | |
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
| G2 | `/mcp-server` (`fetch_g2_reviews` / `import_g2_csv`) | Partner API already wired; CSV fallback for demo |
| Tickets | `/lib/ingestion/tickets.ts` (CSV) + `/lib/ingestion/zendesk-live.ts` (live) | Zendesk live sync wired up (OAuth client_credentials); Freshdesk still CSV-only |

### Why a custom G2 MCP server?

G2 has **no official MCP server as of 2026**. The `/mcp-server` package wraps the Partner API v2 (`GET https://data.g2.com/api/v2/products/{product_id}/reviews`, `Authorization: Bearer <G2_API_KEY>`, cursor pagination), normalizes into the shared schema, and upserts to Supabase. Keeping it as a separate deployable unit means Claude Desktop (or any MCP client) can drive G2 ingestion independently of the Next.js app.

A valid `G2_API_KEY` alone isn't sufficient — G2 also requires a **data subscription** granted for the specific `product_id` (via the partner portal); a key with no subscription authenticates fine but gets `403` on every product's reviews. See `mcp-server/README.md` for the exact auth/pagination/field-mapping shape.

### Zendesk live sync

`lib/ingestion/zendesk-live.ts` fetches tickets via `GET /api/v2/tickets.json` and normalizes them, triggered from Admin → "Sync Zendesk" (`POST /api/ingest` with `{action: "sync_zendesk"}`, admin-token gated).

Auth is **OAuth 2.0 client credentials** (`POST /oauth/tokens`, `grant_type=client_credentials`), not a static API token — Zendesk blocked new API-token creation for accounts created on/after 2026-07-28 and is fully retiring them by 2027-04-30. Create a **Confidential** OAuth client in Admin Center → Apps and integrations → APIs → OAuth clients (no redirect URL needed for this grant type); the client's Identifier/Secret become `ZENDESK_CLIENT_ID`/`ZENDESK_CLIENT_SECRET`. The access token is short-lived (~30 min) and cached in-memory per process, re-fetched automatically on expiry.

## Pipeline design

Stages are **independently re-runnable** and **idempotent** (each overwrites only its own tables/columns):

1. **Pain points** — Claude extracts summary, severity, sentiment, product area → `pain_points`
2. **Churn** — Claude classifies risk + signal type; tickets 2×, 1–2★ 1.5×, G2 1× → `churn_signals`
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

Single-page app (`/`) with a global filter context (company, source, date, severity) that applies across every view. The left sidebar (`SidebarNav`) is a real client-side view switcher (`ViewProvider`/`useView`, `components/dashboard/ViewProvider.tsx`) — only one section renders at a time: AI Suggestions, Pain Points, Churn, Clusters, Features, Roadmap, or Admin (visually demoted below a separator — operator-only, not a peer analyst view). Below the `lg` breakpoint the sidebar is hidden and `MobileViewSelect` (a `Select` dropdown) takes over as the nav.

Shared presentational components live in `components/dashboard/shared/` (`SectionHeader`, `StatGrid`) and every section is built on the shadcn `Card`/`Table` primitives (`components/ui/`) rather than ad hoc markup, so spacing/radius/shadow stay consistent. Chart colors are centralized in `lib/dashboard/theme.ts` (mirrors the `--chart-1..5` CSS vars in `app/globals.css`) with one semantic mapping: teal = brand/positive, terracotta = attention/medium, red = critical only, slate = neutral. Navy is reserved for sidebar chrome and never appears in data viz.

CSV upload and G2/Zendesk sync (`IngestPanel`, `components/dashboard/IngestPanel.tsx`) live permanently in the sidebar rather than inside any switched view — they're operator actions that should stay reachable no matter what an analyst is currently looking at. Admin holds only cluster controls and the pipeline stage table.

**Tailwind version note:** this project runs Tailwind v3.4.1. The installed shadcn `components/ui/` primitives were originally generated for Tailwind v4 and used v4-only syntax (`px-(--var)`, `data-open:`, `data-checked:`, etc.) that v3 silently fails to parse — no error, just missing CSS. Several of these were found and fixed (card, slider, checkbox, separator, sheet, select, dropdown-menu var-syntax). If a shadcn component looks unstyled or a state variant (hover/open/checked/disabled) doesn't visually apply, check for bare `data-x:`/`-(--var)` syntax first — the fix is the v3 bracket form (`data-[state=x]:`, `[var(--x)]`).

## Auth

Single-admin model backed by **Supabase Auth** (email/password) — no separate token to distribute. Every **read** route (`GET /api/dashboard`, `GET /api/pipeline`, and the automatic on-load `POST /api/suggestions` with `force: false`) is public, so the dashboard works as a passive demo link for anyone. Every **mutating / spend-triggering** route requires a signed-in session:

| Route | Gated when |
|-------|------------|
| `POST /api/ingest` | always (CSV upload, G2/Zendesk sync) |
| `POST /api/pipeline` | always (re-runs a pipeline stage — real Claude/Voyage spend) |
| `PATCH /api/roadmap` | always (drag-and-drop bucket override) |
| `POST /api/suggestions` | only when `force: true` (the "Regenerate" button — bypasses cache, real Claude spend) |

- `lib/supabase/auth-browser.ts` / `auth-server.ts` — cookie-backed Supabase clients (`@supabase/ssr`), separate from `lib/supabase/client.ts` (the data-access client, which never touches auth/cookies).
- `middleware.ts` — refreshes the session cookie every request via `getClaims()` (JWT-verified). Uses Next 14's `middleware.ts`/`export function middleware` convention — this project pins Next 14.2.35, not the `proxy.ts` convention newer Next versions/docs now show.
- `lib/auth/admin.ts` — `requireAdminAuth()` checks the Supabase session server-side (no more static-token comparison).
- `lib/auth/admin-client.ts` — client-side `adminFetch`: session cookie is sent automatically; on a 401 it redirects to `/login` instead of prompting for anything.
- `app/login/page.tsx` — email/password sign-in form. Sidebar shows the signed-in email + sign-out, or a "Sign in" link.
- Admin/Roadmap-drag/Regenerate **UI stays fully visible** to everyone — only the underlying fetch is gated (hiding controls client-side would be security theater, and a portfolio visitor should still see the surface exists).
- To add/reset the admin account: Supabase Dashboard → Authentication → Users, or `supabase.auth.admin.createUser({ email, password, email_confirm: true })` via the service-role client.

## Deployment

Live at **https://ccpilot.vercel.app** (Vercel project `subbu0396s-projects/ccpilot`), backed by Supabase (not local-JSON mode) with real `ANTHROPIC_API_KEY`/`VOYAGE_API_KEY`. See [`NOTES.md`](./NOTES.md) for the running change log of what's shipped since the initial build.
