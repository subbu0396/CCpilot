# CCPilot MCP server

A local [Model Context Protocol](https://modelcontextprotocol.io) server that
exposes CCPilot's data and integrations as tools, so you can query and act on
customer feedback/churn/roadmap data from Claude Desktop or Claude Code instead
of (or alongside) the dashboard.

It's a thin wrapper: every tool calls the same backend functions the Next.js app
uses (`lib/store/dashboard-data.ts`, `lib/integrations/jira.ts`), so answers match
what's on screen in the dashboard. It runs as a standalone local process — no
extra server to deploy, no new auth to manage.

## Tools

| Tool | What it does |
| --- | --- |
| `get_pain_points` | Top pain points by severity (desc). `{ limit? }` |
| `get_churn_risk` | High-risk churn signals by weighted score (desc). `{ limit?, company? }` |
| `get_live_analysis` | Core Analysis Agent output (Zendesk webhook) by churn risk score (desc). `{ limit?, company? }` |
| `get_roadmap` | Roadmap items with feature name, impact, and linked Jira issue. `{ bucket? }` |
| `create_jira_issue` | Create a standalone Jira issue. `{ summary, description, labels? }` |
| `move_roadmap_item` | Move a roadmap item into now/next/later; moving into "now" auto-creates a Jira issue, same as dragging it in the dashboard. `{ roadmap_id, bucket }` |
| `transition_jira_issue` | Transition a Jira issue to a target status by name (e.g. "Done"), resolving the correct transition from the issue's current workflow state automatically. `{ issue_key, status }` |
| `link_jira_issue` | Attach an existing Jira issue key/url to a roadmap item, without creating a new one (use instead of `move_roadmap_item` when a ticket already exists for the same work). `{ roadmap_id, jira_issue_key, jira_issue_url }` |
| `sync_zendesk` | Pull latest tickets/comments from Zendesk and upsert them as feedback items, same as the dashboard's "Sync" button. `{ company? }` |
| `explain_roadmap_item` | Explains why a roadmap item is in its bucket, grounded in the real impact/effort/churn scoring math (not just the stored one-line rationale). Pass `compare_to_id` to explain why one item outranks another. `{ roadmap_id, compare_to_id? }` |

## Running it

```bash
npm run mcp
```

It reads the same env vars as the Next.js app (`NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `JIRA_*`, etc. — see `.env.local.example`) from
`.env.local` in the project root via `dotenv/config`. Without Supabase env vars
set, it falls back to local JSON-file mode (`data/db.json`), same as the app.

## Add to Claude Desktop

Edit `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "ccpilot": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/ccpilot/mcp-server/index.ts"],
      "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "...",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY": "...",
        "SUPABASE_SERVICE_ROLE_KEY": "...",
        "JIRA_BASE_URL": "...",
        "JIRA_EMAIL": "...",
        "JIRA_API_TOKEN": "...",
        "JIRA_PROJECT_KEY": "...",
        "JIRA_ISSUE_TYPE": "Task"
      }
    }
  }
}
```

Restart Claude Desktop, then ask things like:

- "What's our top churn risk right now?"
- "Show me the pain points for NovaPulse."
- "Move the top roadmap item into Now and file a Jira ticket for it."

## Add to Claude Code

```bash
claude mcp add ccpilot -- npx tsx /absolute/path/to/ccpilot/mcp-server/index.ts
```

## Not yet built

Running the Core Analysis Agent (sentiment/churn scoring, Zendesk priority
escalation) on items pulled in via `sync_zendesk` — that only runs today via the
Zendesk webhook on new ticket/comment activity, not on a manual sync.
