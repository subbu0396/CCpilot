import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  NormalizedFeedbackSchema,
  type NormalizedFeedback,
} from "./schema";

export function validateFeedback(
  rows: unknown[]
): { valid: NormalizedFeedback[]; errors: string[] } {
  const valid: NormalizedFeedback[] = [];
  const errors: string[] = [];
  rows.forEach((row, i) => {
    const parsed = NormalizedFeedbackSchema.safeParse(row);
    if (parsed.success) {
      valid.push(parsed.data);
    } else {
      errors.push(`Row ${i}: ${parsed.error.message}`);
    }
  });
  return { valid, errors };
}

export async function upsertFeedbackItems(
  supabase: SupabaseClient<Database>,
  items: NormalizedFeedback[]
): Promise<{ inserted: number; errors: string[] }> {
  const errors: string[] = [];
  let inserted = 0;
  const batchSize = 100;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize).map((item) => ({
      source: item.source,
      company: item.company,
      text: item.text,
      rating: item.rating,
      timestamp: item.timestamp,
      customer_id: item.customer_id,
      metadata: item.metadata ?? {},
      external_id: item.external_id ?? null,
    }));

    const { data, error } = await supabase
      .from("feedback_items")
      .upsert(batch as never, {
        onConflict: "source,company,external_id",
        ignoreDuplicates: false,
      })
      .select("id");

    if (error) {
      errors.push(`Batch ${i / batchSize}: ${error.message}`);
    } else {
      inserted += data?.length ?? batch.length;
    }
  }

  return { inserted, errors };
}
