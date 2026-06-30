# Customer Intelligence Copilot (CCpilot)

Portfolio demo: ingest multi-source customer feedback via MCP, store in Supabase, analyze with Claude, present as a product dashboard.

## Quick start

### 1. Supabase

1. Create a Supabase project.
2. Run `supabase/migrations/001_initial_schema.sql` in the SQL editor.
3. Copy URL and keys to env files.

### 2. MCP server (ingestion)

```bash
cd mcp-server
cp .env.example .env   # fill in Supabase credentials
npm install
npm run import:tickets -- ../sample-data/support-tickets.csv
```

Other tools:

```bash
npx tsx src/cli.ts import_playstore_reviews ../sample-data/playstore-reviews.csv
npx tsx src/cli.ts import_call_transcripts ../sample-data/call-transcripts.csv
npx tsx src/cli.ts import_online_reviews ../sample-data/online-reviews.csv
```

Start MCP server (stdio, for Cursor):

```bash
npm run dev
```

### 3. Next.js app

```bash
cd app
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000

## Project structure

```
CCpilot/
├── app/                 # Next.js 14 dashboard
├── mcp-server/          # MCP ingestion server (4 tools)
├── shared/              # Zod schemas shared across packages
├── sample-data/         # CSV/JSON demo files
├── supabase/migrations/ # Postgres schema
└── ARCHITECTURE.md      # Design decisions + live integration path
```

## Sample data

See `sample-data/README.md` for the finalized schema. A 5-row support ticket stub is included for smoke tests. Generate ~50–100 records per source for the full demo.

## Status

- [x] Scaffold + Supabase schema
- [x] MCP server with 4 import tools
- [x] End-to-end ingestion pattern (parse → normalize → upsert)
- [x] Minimal dashboard (home, upload preview, ingestion status)
- [ ] Full synthetic sample datasets (user-generated)
- [ ] Analysis pipeline (Claude + Voyage + job queue)
- [ ] Dashboard pages (pain points, churn, clusters, features, roadmap)
