# G2 MCP Server

Custom Model Context Protocol server that ingests G2 reviews into the Customer Intelligence Copilot Supabase `feedback_items` table.

> **NOTE:** G2 has no official MCP server as of 2026 — this custom MCP tool wraps the G2 Partner API (v2) directly. Requires a G2 Partner API key with the `products.reviews.read` scope **and** a data subscription granted for the target product on G2's side (a valid key with no subscription returns `403`). For the portfolio demo, fall back to CSV import via the `import_g2_csv` tool if no key/subscription is available.

## Tools

| Tool | Purpose |
|------|---------|
| `fetch_g2_reviews` | Live G2 Partner API (`GET https://data.g2.com/api/v2/products/{product_id}/reviews`) |
| `import_g2_csv` | CSV fallback with the same field mapping |

### Auth (live API)

```
Authorization: Bearer <G2_API_KEY>
```

(`AccountAPIToken` security scheme — HTTP bearer, not the `Token token=` scheme some older G2 docs describe.)

### Pagination

Cursor-based: request `page[size]`, follow `links.next` (a full URL) until it's `null`. Not page-number based.

### Field mapping

| G2 field | Shared schema |
|----------|---------------|
| `attributes.title` + flattened `attributes.answers` | `text` |
| `attributes.star_rating` (already 1–5) | `rating` |
| `attributes.submitted_at` | `timestamp` |
| `attributes.product_name` | `company` |
| included `user` (via `?include=user`) | `customer_id`, `metadata.reviewer_company`, `metadata.reviewer_industry` |

`answers` has no fixed schema per G2's OpenAPI spec ("Formatted question answers (pros, cons, etc.)") — `normalizeG2ApiReview` flattens every string leaf it finds rather than assuming specific keys.

## Setup

```bash
cd mcp-server
npm install
cp ../.env.local.example .env   # or symlink ../.env.local
```

Required env vars:

- `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `G2_API_KEY` (optional — CSV tool works without it)

## Run alongside the Next.js app

```bash
# Terminal 1 — Next.js
cd .. && npm run dev

# Terminal 2 — MCP server (stdio; typically launched by an MCP client)
cd mcp-server && npm run dev
```

### Claude Desktop config example

```json
{
  "mcpServers": {
    "ccpilot-g2": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/ccpilot/mcp-server/index.ts"],
      "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "...",
        "SUPABASE_SERVICE_ROLE_KEY": "...",
        "G2_API_KEY": "..."
      }
    }
  }
}
```

### Demo: import sample G2 CSV

From an MCP client, call:

```json
{
  "name": "import_g2_csv",
  "arguments": {
    "file_path": "/absolute/path/to/ccpilot/sample-data/flowdesk_g2.csv",
    "company": "Flowdesk"
  }
}
```

Or use the Next.js load script which imports all sample CSVs including G2.
