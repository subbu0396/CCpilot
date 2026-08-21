import { TriageOutputSchema } from "@/lib/ingestion/schema";
import type { FeedbackItem, FeedbackTriage } from "@/lib/supabase/types";
import { listFeedbackItems } from "@/lib/store/feedback";
import { isLocalMode, readDb, writeDb, newId } from "@/lib/store/local-db";
import { createServiceClient } from "@/lib/supabase/client";
import {
  cachedJsonCompletion,
  emptyUsage,
  hasAnthropicKey,
  mergeUsage,
  type TokenUsage,
} from "./claude";
import { startJob, finishJob } from "./jobs";
import { mapWithConcurrency } from "./concurrency";
import { z } from "zod";

const CONCURRENCY = 10;

const SYSTEM = `You classify a single piece of customer feedback into exactly one type.
Return ONLY valid JSON matching:
{
  "feedback_type": "bug"|"feature_request"|"question"|"other",
  "rationale": "one short sentence explaining the classification"
}
- bug: reports something broken, failing, or not working as expected.
- feature_request: asks for a new capability or improvement that doesn't exist yet.
- question: asking how something works or for clarification, not reporting an issue.
- other: doesn't clearly fit the above (e.g. general praise, unrelated comment).`;

type TriageOut = z.infer<typeof TriageOutputSchema>;

function heuristicTriage(item: FeedbackItem): TriageOut {
  const text = item.text.toLowerCase();

  if (/broken|bug|error|crash|doesn't work|does not work|fails?\b|failing/.test(text)) {
    return { feedback_type: "bug", rationale: "Mentions something broken or failing." };
  }
  if (
    /would be nice|wish|please add|feature request|can you add|it would help|would love|should support/.test(
      text
    )
  ) {
    return {
      feedback_type: "feature_request",
      rationale: "Asks for a new capability or improvement.",
    };
  }
  if (/^\s*(how|why|what|when|where|can i)\b/.test(text) || text.trim().endsWith("?")) {
    return { feedback_type: "question", rationale: "Phrased as a question." };
  }
  return { feedback_type: "other", rationale: "Doesn't clearly match bug/feature/question." };
}

async function upsertTriage(row: Omit<FeedbackTriage, "id">) {
  if (isLocalMode()) {
    const db = readDb();
    const idx = db.feedback_triage.findIndex(
      (t) => t.feedback_item_id === row.feedback_item_id
    );
    const full: FeedbackTriage = {
      id: idx >= 0 ? db.feedback_triage[idx].id : newId(),
      ...row,
      updated_at: new Date().toISOString(),
      created_at: idx >= 0 ? db.feedback_triage[idx].created_at : new Date().toISOString(),
    };
    if (idx >= 0) db.feedback_triage[idx] = full;
    else db.feedback_triage.push(full);
    writeDb(db);
    return;
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("feedback_triage").upsert(
    {
      feedback_item_id: row.feedback_item_id,
      feedback_type: row.feedback_type,
      rationale: row.rationale,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "feedback_item_id" }
  );
  if (error) throw new Error(error.message);
}

export async function runTriage(opts?: {
  company?: string;
  limit?: number;
}): Promise<{ processed: number; jobId: string; mode: "claude" | "heuristic" }> {
  let items = await listFeedbackItems(
    opts?.company ? { companies: [opts.company] } : undefined
  );
  if (opts?.limit) items = items.slice(0, opts.limit);

  const job = await startJob("triage", items.length, opts?.company);
  let usage: TokenUsage = emptyUsage();
  const mode = hasAnthropicKey() ? "claude" : "heuristic";
  let processed = 0;

  try {
    await mapWithConcurrency(items, CONCURRENCY, async (item) => {
      let out: TriageOut;
      if (hasAnthropicKey()) {
        const result = await cachedJsonCompletion({
          system: SYSTEM,
          user: JSON.stringify({ text: item.text, rating: item.rating }),
          schema: TriageOutputSchema,
        });
        out = result.data;
        usage = mergeUsage(usage, result.usage);
      } else {
        out = heuristicTriage(item);
      }

      await upsertTriage({
        feedback_item_id: item.id,
        feedback_type: out.feedback_type,
        rationale: out.rationale,
      });
      processed += 1;
      if (processed % 25 === 0) {
        console.log(`[triage] ${processed}/${items.length}`);
      }
    });

    await finishJob(job.id, {
      status: "completed",
      records_processed: processed,
      usage,
      metadata: { mode },
    });
    return { processed, jobId: job.id, mode };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishJob(job.id, {
      status: "failed",
      records_processed: processed,
      usage,
      error_message: msg,
    });
    throw err;
  }
}
