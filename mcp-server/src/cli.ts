#!/usr/bin/env node
import "dotenv/config";
import { runIngestion } from "./lib/ingestion.js";
import { parsePlaystoreReviews } from "./lib/parsers/playstore.js";
import { parseCallTranscripts } from "./lib/parsers/call-transcripts.js";
import { parseOnlineReviews } from "./lib/parsers/online-reviews.js";
import { parseSupportTickets } from "./lib/parsers/support-tickets.js";

const TOOLS = {
  import_support_tickets: {
    source: "ticket" as const,
    parser: parseSupportTickets,
  },
  import_playstore_reviews: {
    source: "playstore" as const,
    parser: parsePlaystoreReviews,
  },
  import_call_transcripts: {
    source: "call" as const,
    parser: parseCallTranscripts,
  },
  import_online_reviews: {
    source: "review" as const,
    parser: parseOnlineReviews,
  },
};

async function main() {
  const [, , toolName, filePath] = process.argv;

  if (!toolName || !filePath) {
    console.error(
      "Usage: tsx src/cli.ts <tool_name> <file_path>\n" +
        "Tools: " +
        Object.keys(TOOLS).join(", ")
    );
    process.exit(1);
  }

  const tool = TOOLS[toolName as keyof typeof TOOLS];
  if (!tool) {
    console.error(`Unknown tool: ${toolName}`);
    process.exit(1);
  }

  const result = await runIngestion(tool.source, filePath, tool.parser);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
