import { embedTexts, embeddingToPgVector } from "../voyage";
import { createServerClient } from "@/lib/supabase/client";
import type { FeedbackRow } from "../db";

const BATCH_SIZE = 3;

export async function runEmbeddingsBatch(
  items: FeedbackRow[],
  offset: number
): Promise<{ processed: number; has_more: boolean; next_offset: number }> {
  const batch = items.slice(offset, offset + BATCH_SIZE);
  if (batch.length === 0) {
    return { processed: 0, has_more: false, next_offset: offset };
  }

  const supabase = createServerClient();
  const texts = batch.map((i) => i.text.slice(0, 4000));
  const embeddings = await embedTexts(texts);

  let processed = 0;
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

  const next = offset + BATCH_SIZE;
  return {
    processed,
    has_more: next < items.length,
    next_offset: next,
  };
}

export async function runEmbeddings(items: FeedbackRow[]): Promise<number> {
  let total = 0;
  let offset = 0;
  while (offset < items.length) {
    const r = await runEmbeddingsBatch(items, offset);
    total += r.processed;
    offset = r.next_offset;
  }
  return total;
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
