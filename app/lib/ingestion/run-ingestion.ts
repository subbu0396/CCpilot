import { createServerClient } from "@/lib/supabase/client";
import {
  FeedbackSource,
  NormalizedFeedbackItem as NormalizedFeedbackItemSchema,
  type FeedbackSource as FeedbackSourceType,
  type IngestionResult,
} from "@/lib/schema";
import { parseFileContent } from "./parse-content";
import { type ParserFn } from "./utils";

export async function runIngestionFromContent(
  source: FeedbackSourceType,
  content: string,
  fileName: string,
  parser: ParserFn
): Promise<IngestionResult> {
  const supabase = createServerClient();
  const runId = crypto.randomUUID();
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  await supabase.from("ingestion_runs").insert({
    id: runId,
    source,
    status: "running",
    file_path: fileName,
  });

  try {
    const rawRows = parseFileContent(content, fileName);
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
        errors.push(
          `Upsert failed for ${parsed.data.external_id}: ${error.message}`
        );
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
        error_message:
          errors.length > 0 ? errors.slice(0, 5).join("; ") : null,
      })
      .eq("id", runId);

    return { source, imported, skipped, errors, run_id: runId };
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

export function parseSource(value: string): FeedbackSourceType {
  return FeedbackSource.parse(value);
}
