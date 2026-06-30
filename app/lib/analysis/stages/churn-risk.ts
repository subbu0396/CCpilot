import { callClaudeJson } from "../claude";
import { createServerClient } from "@/lib/supabase/client";
import {
  ChurnBatchResult,
  SOURCE_CHURN_WEIGHTS,
  type ChurnAssessment,
} from "../schemas";
import type { FeedbackRow } from "../db";

const SYSTEM = `You are a customer success analyst assessing churn risk from feedback.
Consider: explicit cancellation threats, repeated unresolved issues, competitor mentions, executive escalation, billing disputes, and critical blockers.
Risk levels: none, low, medium, high. Provide a brief justification.`;

const SCHEMA = `{ "items": [{ "feedback_item_id": "uuid", "risk_level": "none|low|medium|high", "justification": "string" }] }`;

const BATCH_SIZE = 3;

async function processChurnBatch(batch: FeedbackRow[]): Promise<number> {
  if (batch.length === 0) return 0;

  const supabase = createServerClient();
  const payload = batch.map((item) => ({
    feedback_item_id: item.id,
    source: item.source,
    source_weight: SOURCE_CHURN_WEIGHTS[item.source] ?? 1,
    customer_id: item.customer_id,
    text: item.text.slice(0, 2000),
    rating: item.rating,
  }));

  const result = await callClaudeJson<{ items: ChurnAssessment[] }>({
    system: SYSTEM,
    user: `Score churn risk (source_weight indicates signal strength — calls and tickets weigh more):\n${JSON.stringify(payload, null, 2)}`,
    schemaHint: SCHEMA,
  });

  const parsed = ChurnBatchResult.safeParse(result);
  if (!parsed.success) {
    throw new Error(`Churn validation failed: ${parsed.error.message}`);
  }

  let processed = 0;
  for (const ca of parsed.data.items) {
    const item = batch.find((b) => b.id === ca.feedback_item_id);
    const weight = SOURCE_CHURN_WEIGHTS[item?.source ?? "review"] ?? 1;

    const { error } = await supabase.from("churn_assessments").upsert(
      {
        feedback_item_id: ca.feedback_item_id,
        customer_id: item?.customer_id ?? null,
        risk_level: ca.risk_level,
        justification: ca.justification,
        source_weight: weight,
        analyzed_at: new Date().toISOString(),
      },
      { onConflict: "feedback_item_id" }
    );
    if (!error) processed++;
  }
  return processed;
}

export async function runChurnBatch(
  items: FeedbackRow[],
  offset: number
): Promise<{ processed: number; has_more: boolean; next_offset: number }> {
  const batch = items.slice(offset, offset + BATCH_SIZE);
  const processed = await processChurnBatch(batch);
  const next = offset + BATCH_SIZE;
  return {
    processed,
    has_more: next < items.length,
    next_offset: next,
  };
}

export async function runChurnScoring(items: FeedbackRow[]): Promise<number> {
  let total = 0;
  let offset = 0;
  while (offset < items.length) {
    const r = await runChurnBatch(items, offset);
    total += r.processed;
    offset = r.next_offset;
  }
  return total;
}
