/**
 * import_g2_csv — CSV fallback when G2_API_KEY is unavailable.
 * Uses the same field mapping as fetch_g2_reviews.
 */

import { readFile } from "node:fs/promises";
import Papa from "papaparse";
import {
  normalizeG2CsvRow,
  type NormalizedFeedback,
} from "../lib/normalize.js";
import { getServiceClient, upsertG2Feedback } from "../lib/supabase.js";

export interface ImportG2CsvArgs {
  /** Absolute or relative path to a G2 export CSV */
  file_path: string;
  /** Optional company override if product_name column is missing */
  company?: string;
}

export async function importG2Csv(
  args: ImportG2CsvArgs
): Promise<{
  ok: boolean;
  fetched: number;
  inserted: number;
  errors: string[];
  message: string;
}> {
  console.log(`[g2-mcp] Reading G2 CSV: ${args.file_path}`);

  let csvText: string;
  try {
    csvText = await readFile(args.file_path, "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[g2-mcp] Failed to read CSV: ${msg}`);
    return {
      ok: false,
      fetched: 0,
      inserted: 0,
      errors: [msg],
      message: `Failed to read ${args.file_path}`,
    };
  }

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length) {
    console.error(`[g2-mcp] CSV parse warnings:`, parsed.errors.slice(0, 5));
  }

  const all: NormalizedFeedback[] = [];
  for (const row of parsed.data) {
    const n = normalizeG2CsvRow(row, args.company);
    if (n) all.push(n);
  }

  console.log(
    `[g2-mcp] Normalized ${all.length} G2 CSV rows — writing to Supabase`
  );

  const supabase = getServiceClient();
  const { inserted, errors } = await upsertG2Feedback(supabase, all);

  return {
    ok: errors.length === 0,
    fetched: all.length,
    inserted,
    errors,
    message: `Imported ${inserted} G2 reviews from CSV (${all.length} normalized)`,
  };
}
