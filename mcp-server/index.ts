#!/usr/bin/env node
/**
 * Custom MCP server — G2 Partner API connector.
 *
 * NOTE: G2 has no official MCP server as of 2026 — this custom MCP tool wraps
 * the G2 Partner API directly. Requires a G2 Partner API key. For the portfolio
 * demo, fall back to CSV import via `import_g2_csv` if no key is available.
 *
 * Tools:
 *   - fetch_g2_reviews  (live API)
 *   - import_g2_csv     (CSV fallback)
 */

import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { fetchG2Reviews } from "./tools/fetch-g2-reviews.js";
import { importG2Csv } from "./tools/import-g2-csv.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, ".env") });

const server = new Server(
  { name: "ccpilot-g2", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "fetch_g2_reviews",
      description:
        "Fetch paginated reviews from the G2 Partner API (v2, Bearer auth) and upsert into Supabase feedback_items. Requires G2_API_KEY with products.reviews.read scope and a data subscription for product_id.",
      inputSchema: {
        type: "object",
        properties: {
          product_id: {
            type: "string",
            description: "G2 product id to filter reviews",
          },
          page: {
            type: "number",
            description: "Starting page (default 1)",
          },
          per_page: {
            type: "number",
            description: "Page size, max 100 (default 100)",
          },
          company: {
            type: "string",
            description: "Fallback company name if product_name missing",
          },
        },
        required: ["product_id"],
      },
    },
    {
      name: "import_g2_csv",
      description:
        "Fallback: import a G2 export CSV into feedback_items using the same normalization as the live API. Use when G2_API_KEY is unavailable.",
      inputSchema: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Path to G2 CSV export file",
          },
          company: {
            type: "string",
            description: "Fallback company name",
          },
        },
        required: ["file_path"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "fetch_g2_reviews") {
      const result = await fetchG2Reviews(
        args as {
          product_id: string;
          page?: number;
          per_page?: number;
          company?: string;
        }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: !result.ok,
      };
    }

    if (name === "import_g2_csv") {
      const result = await importG2Csv(
        args as { file_path: string; company?: string }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: !result.ok,
      };
    }

    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[g2-mcp] Tool error: ${msg}`);
    return {
      content: [{ type: "text", text: JSON.stringify({ ok: false, error: msg }) }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[g2-mcp] Customer Intelligence Copilot G2 MCP server running on stdio");
}

main().catch((err) => {
  console.error("[g2-mcp] Fatal:", err);
  process.exit(1);
});
