import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import { v4 as uuidv4 } from "uuid";
import type { FeedbackSource, NormalizedFeedbackItem } from "../schema.js";
import { NormalizedFeedbackItem as NormalizedFeedbackItemSchema } from "../schema.js";
import { getSupabase } from "./supabase.js";

export type ParserFn = (raw: unknown) => NormalizedFeedbackItem[];

export async function readDataFile(filePath: string): Promise<unknown[]> {
  const content = await readFile(filePath, "utf-8");
  const ext = extname(filePath).toLowerCase();

  if (ext === ".json") {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  if (ext === ".csv") {
    return parseCsv(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[];
  }

  throw new Error(`Unsupported file type: ${ext}. Use .csv or .json`);
}

export async function runIngestion(
  source: FeedbackSource,
  filePath: string,
  parser: ParserFn
): Promise<{
  imported: number;
  skipped: number;
  errors: string[];
  run_id: string;
}> {
  const supabase = getSupabase();
  const runId = uuidv4();
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  await supabase.from("ingestion_runs").insert({
    id: runId,
    source,
    status: "running",
    file_path: filePath,
  });

  try {
    const rawRows = await readDataFile(filePath);
    const normalized = parser(rawRows);

    for (const item of normalized) {
      const parsed = NormalizedFeedbackItemSchema.safeParse(item);
      if (!parsed.success) {
        errors.push(
          `Validation failed for ${item.external_id ?? "unknown"}: ${parsed.error.message}`
        );
        skipped++;
        continue;
      }

      const { error } = await supabase.from("feedback_items").upsert(
        {
          external_id: parsed.data.external_id,
          source: parsed.data.source,
          text: parsed.data.text,
          rating: parsed.data.rating ?? null,
          timestamp: parsed.data.timestamp,
          customer_id: parsed.data.customer_id ?? null,
          metadata: parsed.data.metadata,
        },
        { onConflict: "source,external_id" }
      );

      if (error) {
        errors.push(`Upsert failed for ${parsed.data.external_id}: ${error.message}`);
        skipped++;
      } else {
        imported++;
      }
    }

    await supabase
      .from("ingestion_runs")
      .update({
        status: errors.length > 0 && imported === 0 ? "failed" : "completed",
        records_imported: imported,
        records_skipped: skipped,
        completed_at: new Date().toISOString(),
        error_message: errors.length > 0 ? errors.slice(0, 5).join("; ") : null,
      })
      .eq("id", runId);

    return { imported, skipped, errors, run_id: runId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("ingestion_runs")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    throw err;
  }
}

export function pickField(
  row: Record<string, string>,
  candidates: string[]
): string | undefined {
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const normalizedCandidate = normalize(candidate);
    const match = keys.find((k) => normalize(k) === normalizedCandidate);
    if (match && row[match]) return row[match];
  }
  return undefined;
}

export function parseTimestamp(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

export function combineText(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join("\n\n").trim();
}
