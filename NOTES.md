# Change Notes

Running log of what changed and why, newest first. For full detail see the
commit each entry references.

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
