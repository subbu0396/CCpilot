#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runIngestion } from "./lib/ingestion.js";
import { parsePlaystoreReviews } from "./lib/parsers/playstore.js";
import { parseCallTranscripts } from "./lib/parsers/call-transcripts.js";
import { parseOnlineReviews } from "./lib/parsers/online-reviews.js";
import { parseSupportTickets } from "./lib/parsers/support-tickets.js";

const server = new McpServer({
  name: "ccpilot-ingestion",
  version: "0.1.0",
});

const filePathSchema = {
  file_path: z
    .string()
    .describe("Absolute or relative path to a CSV or JSON export file"),
};

server.registerTool(
  "import_support_tickets",
  {
    description:
      "Import Zendesk/Freshdesk-style support ticket exports into feedback_items",
    inputSchema: filePathSchema,
  },
  async ({ file_path }) => {
    const result = await runIngestion("ticket", file_path, parseSupportTickets);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.registerTool(
  "import_playstore_reviews",
  {
    description: "Import Google Play Store review exports into feedback_items",
    inputSchema: filePathSchema,
  },
  async ({ file_path }) => {
    const result = await runIngestion(
      "playstore",
      file_path,
      parsePlaystoreReviews
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.registerTool(
  "import_call_transcripts",
  {
    description:
      "Import call transcript exports (Gong/Twilio-style) into feedback_items",
    inputSchema: filePathSchema,
  },
  async ({ file_path }) => {
    const result = await runIngestion("call", file_path, parseCallTranscripts);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.registerTool(
  "import_online_reviews",
  {
    description:
      "Import G2/Trustpilot-style online review exports into feedback_items",
    inputSchema: filePathSchema,
  },
  async ({ file_path }) => {
    const result = await runIngestion("review", file_path, parseOnlineReviews);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CCpilot ingestion MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
