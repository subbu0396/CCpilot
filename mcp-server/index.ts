#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getPainPoints, getChurnRisk, getLiveAnalysis, getRoadmap } from "./tools/read";
import { createJiraIssueTool, moveRoadmapItem, linkJiraIssue, transitionJiraIssueTool } from "./tools/actions";
import { syncZendesk } from "./tools/sync";
import { explainRoadmapItem } from "./tools/explain";

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
  "transition_jira_issue",
  {
    description:
      "Transition a Jira issue to a target status by name (e.g. \"In Progress\", \"Done\", \"Resolved\") — resolves the right transition automatically from the issue's current workflow state, no transition ID needed. Requires JIRA_* env vars.",
    inputSchema: {
      issue_key: z.string().describe("e.g. \"KAN-2\""),
      status: z.string().describe("Target status name, matched case-insensitively"),
    },
  },
  async ({ issue_key, status }) => json(await transitionJiraIssueTool({ issue_key, status }))
);

server.registerTool(
  "link_jira_issue",
  {
    description:
      "Attach an existing Jira issue (key + url) to a roadmap item without creating a new one. Use this when a Jira ticket already exists for the same work (e.g. filed as a standalone issue) and you want the roadmap card to reflect it, instead of move_roadmap_item's auto-create-on-Now behavior.",
    inputSchema: {
      roadmap_id: z.string().describe("The roadmap item's id"),
      jira_issue_key: z.string().describe("e.g. \"KAN-3\""),
      jira_issue_url: z.string().describe("Full Jira issue URL"),
    },
  },
  async ({ roadmap_id, jira_issue_key, jira_issue_url }) =>
    json(await linkJiraIssue({ roadmap_id, jira_issue_key, jira_issue_url }))
);

server.registerTool(
  "sync_zendesk",
  {
    description:
      "Pull the latest tickets/comments from Zendesk and persist them as feedback items (upsert by external id). Requires ZENDESK_* env vars. Pass analyze: true to also run the Core Analysis Agent on newly-synced tickets that aren't already scored (same scoring + priority-escalation write-back as the Zendesk webhook path) — opt-in and off by default since a full sync can touch many tickets and each analysis is a real Claude call.",
    inputSchema: {
      company: z.string().optional().describe("Only sync tickets for this company"),
      analyze: z.boolean().optional().describe("Also run Core Analysis Agent scoring on newly-synced tickets (default false)"),
    },
  },
  async ({ company, analyze }) => json(await syncZendesk({ company, analyze }))
);

server.registerTool(
  "explain_roadmap_item",
  {
    description:
      "Explains why a roadmap item is in its bucket (Now/Next/Later), grounded in the actual impact/effort/churn scoring math. Pass compare_to_id to explain why one item is prioritized over another.",
    inputSchema: {
      roadmap_id: z.string().describe("The roadmap item to explain"),
      compare_to_id: z.string().optional().describe("Another roadmap item to compare against"),
    },
  },
  async ({ roadmap_id, compare_to_id }) =>
    json(await explainRoadmapItem({ roadmap_id, compare_to_id }))
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[ccpilot-mcp] fatal error:", err);
  process.exit(1);
});
