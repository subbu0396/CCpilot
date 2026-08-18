import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedFeedback } from "./normalize.js";

export function getServiceClient(): SupabaseClient {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function upsertG2Feedback(
  supabase: SupabaseClient,
  items: NormalizedFeedback[]
): Promise<{ inserted: number; errors: string[] }> {
  const errors: string[] = [];
  let inserted = 0;
  const batchSize = 100;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    console.log(
      `[g2-mcp] Upserting batch ${i / batchSize + 1} (${batch.length} rows)...`
    );
    const { data, error } = await supabase
      .from("feedback_items")
      .upsert(batch, {
        onConflict: "source,company,external_id",
        ignoreDuplicates: false,
      })
      .select("id");

    if (error) {
      console.error(`[g2-mcp] Batch error: ${error.message}`);
      errors.push(error.message);
    } else {
      inserted += data?.length ?? batch.length;
    }
  }

  return { inserted, errors };
}
