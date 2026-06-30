# Customer Intelligence Copilot — Architecture

## Overview

```
┌─────────────────┐     MCP tools (stdio)      ┌──────────────────┐
│  Cursor / CLI   │ ─────────────────────────► │   mcp-server/   │
│  (ingestion)    │                            │  4 import tools   │
└─────────────────┘                            └────────┬─────────┘
                                                        │ upsert
                                                        ▼
                                               ┌──────────────────┐
                                               │    Supabase      │
                                               │  feedback_items  │
                                               │  ingestion_runs  │
                                               └────────┬─────────┘
                                                        │ read
                                                        ▼
                                               ┌──────────────────┐
                                               │     app/         │
                                               │  Next.js 14 UI   │
                                               └──────────────────┘
```

The **MCP server is the system of record for ingestion**. The Next.js app reads from Supabase; it does not call MCP on every page load. This mirrors how a production system would use a dedicated ingestion worker.

## Why import tools, not live APIs?

This is a **portfolio demo** optimized for:

1. **Reproducibility** — Interviewers can run the same import against fixed sample files and get identical dashboards.
2. **No secrets management** — No OAuth flows, API keys, or rate limits to debug during a live demo.
3. **Architecture honesty** — Parsers normalize to a shared schema at the boundary; swapping file reads for API clients is a localized change.

The code structure still treats each source as a pluggable adapter: parser function + `runIngestion()` + MCP tool wrapper.

## Normalized schema

All sources map to:

```ts
{
  external_id: string;   // source-system ID (upsert key with source)
  source: 'playstore' | 'call' | 'ticket' | 'review';
  text: string;
  rating?: number;       // 0–5 where applicable
  timestamp: string;     // ISO 8601
  customer_id?: string;
  metadata: Record<string, unknown>;
}
```

Stored in `feedback_items` with `UNIQUE (source, external_id)` for idempotent re-imports.

## MCP tools

| Tool | Source | Parser | Sample file |
|------|--------|--------|-------------|
| `import_support_tickets` | `ticket` | Zendesk/Freshdesk CSV/JSON | `sample-data/support-tickets.csv` |
| `import_playstore_reviews` | `playstore` | Play Console export | `sample-data/playstore-reviews.csv` |
| `import_call_transcripts` | `call` | Gong/Twilio transcript export | `sample-data/call-transcripts.csv` |
| `import_online_reviews` | `review` | G2/Trustpilot export | `sample-data/online-reviews.csv` |

## Path to live integrations

### `import_support_tickets` → Zendesk

**Today:** Read CSV/JSON export; map `id`, `subject`, `description`, `status`, `tags`, `customer_email`, `created_at`.

**Live change:**
- Add Zendesk API client with subdomain + API token or OAuth.
- Replace `readDataFile()` with paginated `GET /api/v2/tickets.json?sort_by=created_at`.
- Optionally add incremental cursor (`start_time`) stored in `ingestion_runs.payload`.
- Webhook alternative: Zendesk trigger → edge function → same normalizer.

### `import_playstore_reviews` → Google Play

**Today:** CSV export from Play Console or synthetic JSON.

**Live change:**
- Use [Google Play Developer API](https://developers.google.com/android-publisher/api-ref/rest/v3/reviews) `reviews.list` with service account.
- Or `google-play-scraper` for public reviews (no auth, ToS considerations).
- Map `reviewId`, `comments[0].userComment.text`, star rating, `userComment.lastModified`.

### `import_call_transcripts` → Gong / Twilio

**Today:** Transcript CSV/JSON with `call_id`, `transcript`, `summary`, metadata.

**Live change:**
- **Gong:** `GET /v2/calls/extensive` + transcript endpoint; OAuth2 client credentials.
- **Twilio:** Recording webhook → STT (Deepgram/Whisper) → normalize transcript text.
- Store `duration_seconds`, `agent`, platform sentiment scores in `metadata`.

### `import_online_reviews` → G2 / Trustpilot

**Today:** Review aggregator CSV export.

**Live change:**
- **G2:** Partner API or scraped export (check ToS); paginate by `submitted_at`.
- **Trustpilot:** Business Units API `GET /v1/private/business-units/{id}/reviews`.
- Map `title`, `text`, `stars`, `consumer.displayName`, `createdAt`.

## Analysis pipeline (Stage 2 — not yet built)

Planned stages, each as idempotent Postgres job queue entries in `analysis_jobs`:

1. Pain point extraction (Claude + Zod)
2. Churn risk scoring (source-weighted)
3. Embeddings (Voyage AI) + k-means clustering
4. Feature extraction per cluster
5. Roadmap generation (Now/Next/Later)

System prompts will use Anthropic prompt caching. Dashboard routes (`/pain-points`, `/churn-risk`, etc.) read analyzed tables, not raw feedback.

## Deployment

| Unit | Target | Notes |
|------|--------|-------|
| `app/` | Vercel | Env: `NEXT_PUBLIC_SUPABASE_*` |
| `mcp-server/` | Local stdio or small Node host | Env: `SUPABASE_SERVICE_ROLE_KEY` |
| `supabase/` | Supabase hosted | Run `001_initial_schema.sql` |

For Cursor demos, configure the MCP server in `.cursor/mcp.json` pointing at `mcp-server` with stdio transport.

## Interview talking points

- **Separation of concerns:** Ingestion (MCP worker) vs. presentation (Next.js) vs. intelligence (batch jobs).
- **Idempotent ingestion:** `UNIQUE (source, external_id)` + upsert enables safe re-runs.
- **Extension point:** Each parser is a pure function `(raw[]) → NormalizedFeedbackItem[]` — easy to unit test and swap.
- **Why Supabase:** Postgres for relational queries + `pgvector` for embedding clustering in Stage 2.
