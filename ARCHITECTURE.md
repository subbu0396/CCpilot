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
| Tickets | `/lib/ingestion/tickets.ts` | Zendesk/Freshdesk CSV now; REST webhooks later |

### Why a custom G2 MCP server?

G2 has **no official MCP server as of 2026**. The `/mcp-server` package wraps the Partner API (`https://data.g2.com/api/v1/reviews`) with `Authorization: Token token=<G2_API_KEY>`, normalizes into the shared schema, and upserts to Supabase. Keeping it as a separate deployable unit means Claude Desktop (or any MCP client) can drive G2 ingestion independently of the Next.js app.

## Pipeline design

Stages are **independently re-runnable** and **idempotent** (each overwrites only its own tables/columns):

1. **Pain points** — Claude extracts summary, severity, sentiment, product area → `pain_points`
2. **Churn** — Claude classifies risk + signal type; tickets 2×, 1–2★ 1.5×, G2 1× → `churn_signals`
3. **Cluster** — Voyage embeddings → pgvector; `ml-kmeans` (default k=8); Claude labels → `clusters`
4. **Features** — 1–3 features per cluster with impact/effort → `features`
5. **Roadmap** — Now / Next / Later by impact÷effort → `roadmap`

All Claude system prompts use **Anthropic prompt caching** to control cost at scale.

When `ANTHROPIC_API_KEY` / `VOYAGE_API_KEY` are absent, the pipeline runs in **heuristic demo mode** so the portfolio demo stays fully interactive.

## Local vs Supabase

If `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set, data lives in Supabase (apply `supabase/migrations/001_init.sql` first).

Otherwise the app uses `data/local-db.json` so you can demo without cloud credentials. Set `USE_LOCAL_STORE=1` to force local mode.

## Extending to a new source

1. Add a parser in `/lib/ingestion/<source>.ts` that returns `NormalizedFeedback[]`
2. Register it in the admin upload UI and `scripts/load-sample-data.ts`
3. Optionally add an MCP tool if the source has an API worth exposing to agents
4. No pipeline changes required — stages read `feedback_items` only

## Dashboard

Single scrollable page (`/`) with sticky sidebar anchors and a global filter context (company, source, date, severity). Sections: AI Suggestions → Pain Points → Churn → Clusters → Features → Roadmap → Admin.
