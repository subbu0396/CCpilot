# G2 MCP Server

Custom Model Context Protocol server that ingests G2 reviews into the Customer Intelligence Copilot Supabase `feedback_items` table.

> **NOTE:** G2 has no official MCP server as of 2026 — this custom MCP tool wraps the G2 Partner API directly. Requires a G2 Partner API key. For the portfolio demo, fall back to CSV import via the `import_g2_csv` tool if no key is available.

## Tools

| Tool | Purpose |
|------|---------|
| `fetch_g2_reviews` | Live G2 Partner API (`https://data.g2.com/api/v1/reviews`) |
| `import_g2_csv` | CSV fallback with the same field mapping |

### Auth (live API)

```
Authorization: Token token=<G2_API_KEY>
```

### Field mapping

| G2 field | Shared schema |
|----------|---------------|
| `attributes.title` + `attributes.body` | `text` |
| `attributes.rating` (/10) | `rating` (/5) |
| `attributes.submitted_at` | `timestamp` |
| `attributes.reviewer.title` | `metadata.reviewer_role` |
| `attributes.product_name` | `company` |

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
