# Customer Intelligence Copilot (CCPilot)

Full-stack feedback intelligence: ingest Play Store and support tickets → Claude analysis pipeline → one interactive dashboard.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for pipeline design and extension points.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui
- Supabase (Postgres + pgvector) — or local JSON store for demo
- Anthropic Claude (prompt caching) + Voyage AI embeddings
- Zendesk live sync (OAuth client credentials)
- Recharts + `@dnd-kit` roadmap board

## Quick start (local demo, no cloud keys)

```bash
npm install
npm run generate:sample   # 6 CSVs, 450 rows
npm run load:sample       # → data/local-db.json
npm run pipeline:run      # heuristic mode without API keys
npm run dev               # http://localhost:3000
```

## Supabase setup

1. Create/open your project and run [`supabase/migrations/001_init.sql`](./supabase/migrations/001_init.sql) in the SQL editor.
2. Copy [`.env.local.example`](./.env.local.example) → `.env.local` and fill:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=          # optional until pipeline quality review
VOYAGE_API_KEY=             # optional
ZENDESK_SUBDOMAIN=          # optional — live ticket sync
ZENDESK_CLIENT_ID=
ZENDESK_CLIENT_SECRET=
```

3. Unset `USE_LOCAL_STORE` (or leave unset). Re-run `npm run load:sample` and `npm run pipeline:run`.
4. Create the admin account (Supabase Dashboard → Authentication → Users) and sign in at `/login` to unlock ingest/pipeline controls.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run generate:sample` | Build `/sample-data` CSVs |
| `npm run load:sample` | Ingest all 6 files |
| `npm run pipeline:run` | Run stages 1–5 |
| `npm run pipeline:pain-points` | Re-run one stage |
| `npm run dev` | Next.js dashboard |

## Deploy (Vercel)

Connect the repo, set the same env vars, and deploy. Apply the SQL migration to production Supabase before first load.
