/**
 * Load all sample-data CSVs into Supabase feedback_items.
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Run: npx tsx scripts/load-sample-data.ts
 */

import { config } from "dotenv";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parsePlayStoreCsv } from "../lib/ingestion/playstore";
import { parseTicketsCsv } from "../lib/ingestion/tickets";
import { parseG2Csv } from "../lib/ingestion/g2-csv";
import { validateFeedback } from "../lib/ingestion/upsert";
import { saveFeedbackItems, listFeedbackItems } from "../lib/store/feedback";
import { isLocalMode } from "../lib/store/local-db";
import type { NormalizedFeedback } from "../lib/ingestion/schema";

config({ path: ".env.local" });
process.env.USE_LOCAL_STORE = process.env.USE_LOCAL_STORE || (isLocalMode() ? "1" : "0");

const SAMPLE_DIR = join(process.cwd(), "sample-data");

function companyFromFilename(name: string): string {
  if (name.startsWith("flowdesk")) return "Flowdesk";
  if (name.startsWith("trackr")) return "Trackr";
  if (name.startsWith("novapulse")) return "NovaPulse";
  return "Unknown";
}

async function main() {
  const files = readdirSync(SAMPLE_DIR).filter((f) => f.endsWith(".csv"));
  if (files.length === 0) {
    throw new Error("No CSV files in sample-data/. Run generate-sample-data.ts first.");
  }

  const all: NormalizedFeedback[] = [];
  const perFile: Record<string, number> = {};

  for (const file of files.sort()) {
    const text = readFileSync(join(SAMPLE_DIR, file), "utf8");
    const company = companyFromFilename(file);
    let rows: NormalizedFeedback[] = [];

    if (file.includes("playstore")) {
      rows = parsePlayStoreCsv(text, company);
    } else if (file.includes("g2")) {
      rows = parseG2Csv(text, company);
    } else if (file.includes("tickets")) {
      rows = parseTicketsCsv(text, company);
    } else {
      console.warn(`Skipping unknown file: ${file}`);
      continue;
    }

    perFile[file] = rows.length;
    all.push(...rows);
    console.log(`Parsed ${file}: ${rows.length} rows`);
  }

  const { valid, errors } = validateFeedback(all);
  if (errors.length) {
    console.error(`Validation errors (${errors.length}):`, errors.slice(0, 10));
  }
  console.log(`Validated ${valid.length} / ${all.length} rows`);

  const { inserted, errors: upsertErrors, mode } = await saveFeedbackItems(valid);

  if (upsertErrors.length) {
    console.error("Upsert errors:", upsertErrors);
  }

  const stored = await listFeedbackItems();
  const byCompanySource: Record<string, number> = {};
  for (const item of stored) {
    const key = `${item.company}|${item.source}`;
    byCompanySource[key] = (byCompanySource[key] ?? 0) + 1;
  }

  console.log("\n── Load summary ──");
  console.log(`Mode:              ${mode}`);
  console.log(`Upserted this run: ${inserted}`);
  console.log(`Store count:       ${stored.length}`);
  console.log("By company × source:");
  Object.entries(byCompanySource)
    .sort()
    .forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log(`\nTOTAL normalized: ${valid.length} (expected 675)`);
  if (stored.length !== 675) {
    console.warn(`WARNING: expected 675 stored rows, got ${stored.length}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
