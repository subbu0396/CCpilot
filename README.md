# Customer Intelligence Copilot (CCPilot)

Full-stack feedback intelligence: ingest Play Store, G2, and support tickets → Claude analysis pipeline → one interactive dashboard.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for pipeline design and extension points.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui
- Supabase (Postgres + pgvector) — or local JSON store for demo
- Anthropic Claude (prompt caching) + Voyage AI embeddings
- Custom G2 MCP server (`/mcp-server`)
- Recharts + `@dnd-kit` roadmap board

## Quick start (local demo, no cloud keys)

```bash
npm install
npm run generate:sample   # 9 CSVs, 675 rows
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
G2_API_KEY=                 # optional — CSV fallback otherwise
```

3. Unset `USE_LOCAL_STORE` (or leave unset). Re-run `npm run load:sample` and `npm run pipeline:run`.

## MCP server (G2)

```bash
cd mcp-server && npm install && npm run dev
```

Tools: `fetch_g2_reviews` (live Partner API) and `import_g2_csv` (demo fallback).

> G2 has no official MCP server as of 2026 — this wraps the Partner API directly.

Details: [`mcp-server/README.md`](./mcp-server/README.md)

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run generate:sample` | Build `/sample-data` CSVs |
| `npm run load:sample` | Ingest all 9 files |
| `npm run pipeline:run` | Run stages 1–5 |
| `npm run pipeline:pain-points` | Re-run one stage |
| `npm run dev` | Next.js dashboard |

## Deploy (Vercel)

Connect the repo, set the same env vars, and deploy. Keep `/mcp-server` as a separate process (or invoke its tools from Claude Desktop). Apply the SQL migration to production Supabase before first load.
