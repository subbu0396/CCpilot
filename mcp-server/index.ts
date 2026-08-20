#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getPainPoints, getChurnRisk, getLiveAnalysis, getRoadmap } from "./tools/read";
import { createJiraIssueTool, moveRoadmapItem } from "./tools/actions";
import { syncZendesk } from "./tools/sync";

const server = new McpServer({ name: "ccpilot", version: "0.1.0" });

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

server.registerTool(
  "get_pain_points",
  {
    description:
      "Top customer pain points extracted from feedback, sorted by severity (5 = highest) descending.",
    inputSchema: {
      limit: z.number().int().positive().max(50).optional().describe("Max rows to return (default 10)"),
    },
  },
  async ({ limit }) => json(await getPainPoints({ limit }))
);

server.registerTool(
  "get_churn_risk",
  {
    description:
      "High-risk churn signals, sorted by weighted risk score descending. Optionally filter by company.",
    inputSchema: {
      limit: z.number().int().positive().max(50).optional().describe("Max rows to return (default 10)"),
      company: z.string().optional().describe("Filter to a single company name"),
    },
  },
  async ({ limit, company }) => json(await getChurnRisk({ limit, company }))
);

server.registerTool(
  "get_live_analysis",
  {
    description:
      "Real-time Core Analysis Agent output for Zendesk tickets/comments processed via webhook, sorted by churn risk score descending.",
    inputSchema: {
      limit: z.number().int().positive().max(50).optional().describe("Max rows to return (default 10)"),
      company: z.string().optional().describe("Filter to a single company name"),
    },
  },
  async ({ limit, company }) => json(await getLiveAnalysis({ limit, company }))
);

server.registerTool(
  "get_roadmap",
  {
    description:
      "Roadmap items (Now/Next/Later) with their linked feature name, impact score, and any linked Jira issue.",
    inputSchema: {
      bucket: z.enum(["now", "next", "later"]).optional().describe("Filter to one bucket"),
    },
  },
  async ({ bucket }) => json(await getRoadmap({ bucket }))
);

server.registerTool(
  "create_jira_issue",
  {
    description:
      "Create a standalone Jira issue (e.g. to file a ticket for a pain point that isn't on the roadmap yet). Requires JIRA_* env vars to be set.",
    inputSchema: {
      summary: z.string().describe("Jira issue summary/title"),
      description: z.string().describe("Jira issue description (plain text)"),
      labels: z.array(z.string()).optional().describe("Labels to apply (default: [\"ccpilot\"])"),
    },
  },
  async ({ summary, description, labels }) =>
    json(await createJiraIssueTool({ summary, description, labels }))
);

server.registerTool(
  "move_roadmap_item",
  {
    description:
      "Move a roadmap item into now/next/later. Moving into \"now\" auto-creates a linked Jira issue (if JIRA_* env vars are set and one doesn't already exist), matching the dashboard's drag-and-drop behavior.",
    inputSchema: {
      roadmap_id: z.string().describe("The roadmap item's id"),
      bucket: z.enum(["now", "next", "later"]),
    },
  },
  async ({ roadmap_id, bucket }) => json(await moveRoadmapItem({ roadmap_id, bucket }))
);

server.registerTool(
  "sync_zendesk",
  {
    description:
      "Pull the latest tickets/comments from Zendesk and persist them as feedback items (upsert by external id). Does not run the Core Analysis Agent — that only runs via the Zendesk webhook on new activity. Requires ZENDESK_* env vars.",
    inputSchema: {
      company: z.string().optional().describe("Only sync tickets for this company"),
    },
  },
  async ({ company }) => json(await syncZendesk({ company }))
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[ccpilot-mcp] fatal error:", err);
  process.exit(1);
});
