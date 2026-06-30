import { embedTexts, embeddingToPgVector } from "../voyage";
import { createServerClient } from "@/lib/supabase/client";
import { chunk } from "../claude";
import type { FeedbackRow } from "../db";

export async function runEmbeddings(items: FeedbackRow[]): Promise<number> {
  if (items.length === 0) return 0;

  const supabase = createServerClient();
  const batches = chunk(items, 32);
  let processed = 0;

  for (const batch of batches) {
    const texts = batch.map((i) => i.text.slice(0, 4000));
    const embeddings = await embedTexts(texts);

    for (let i = 0; i < batch.length; i++) {
      const { error } = await supabase.from("feedback_embeddings").upsert(
        {
          feedback_item_id: batch[i].id,
          embedding: embeddingToPgVector(embeddings[i]),
          model: "voyage-3",
        },
        { onConflict: "feedback_item_id" }
      );
      if (!error) processed++;
    }
  }

  return processed;
}

export async function loadEmbeddings(
  itemIds: string[]
): Promise<{ id: string; embedding: number[] }[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("feedback_embeddings")
    .select("feedback_item_id, embedding")
    .in("feedback_item_id", itemIds);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.feedback_item_id as string,
    embedding: parsePgVector(row.embedding as string),
  }));
}

function parsePgVector(raw: string): number[] {
  const cleaned = raw.replace(/[\[\]]/g, "");
  return cleaned.split(",").map(Number);
}
