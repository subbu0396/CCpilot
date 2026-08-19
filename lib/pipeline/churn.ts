import { ChurnOutputSchema } from "@/lib/ingestion/schema";
import type { FeedbackItem, ChurnSignal, ChurnRisk } from "@/lib/supabase/types";
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

const SYSTEM = `You are a customer success analyst scoring churn risk from feedback.
Return ONLY valid JSON:
{
  "churn_risk": "none"|"low"|"medium"|"high",
  "churn_signal": "short explanation",
  "signal_type": "cancellation_intent"|"competitor_mention"|"repeated_complaint"|"frustration_escalation"|"none"
}`;

type ChurnOut = z.infer<typeof ChurnOutputSchema>;

/** Source weighting: tickets 2x, low ratings (1–2) 1.5x, playstore 1x */
export function sourceWeight(item: FeedbackItem): number {
  let w = 1;
  if (item.source === "ticket") w *= 2;
  if (item.rating !== null && item.rating <= 2) w *= 1.5;
  return w;
}

function riskRank(r: ChurnRisk): number {
  return { none: 0, low: 1, medium: 2, high: 3 }[r];
}

function applyWeight(base: ChurnRisk, weight: number): ChurnRisk {
  let rank = riskRank(base);
  if (weight >= 2 && rank > 0) rank = Math.min(3, rank + 1);
  else if (weight >= 1.5 && rank === 1) rank = 2;
  return (["none", "low", "medium", "high"] as ChurnRisk[])[rank];
}

function heuristicChurn(item: FeedbackItem): ChurnOut {
  const text = item.text.toLowerCase();
  if (/cancel|won't renew|will not renew|before q[1-4]/.test(text)) {
    return {
      churn_risk: "high",
      churn_signal: "Explicit cancellation / non-renewal intent",
      signal_type: "cancellation_intent",
    };
  }
  if (/asana|hubspot|looker|pipedrive|monday\.com|mode analytics|salesforce sync/.test(text) &&
      /evaluat|switch|piloting|considering|replaced|looking at/.test(text)) {
    return {
      churn_risk: "high",
      churn_signal: "Competitor evaluation mentioned",
      signal_type: "competitor_mention",
    };
  }
  if (/repeated|third|again|escalat|vp|third ticket|third escalation/.test(text)) {
    return {
      churn_risk: "medium",
      churn_signal: "Repeated complaint / escalation language",
      signal_type: "repeated_complaint",
    };
  }
  if (/frustrat|broken|unusable|blocking/.test(text)) {
    return {
      churn_risk: "medium",
      churn_signal: "Frustration escalation signals",
      signal_type: "frustration_escalation",
    };
  }
  if (item.rating !== null && item.rating <= 2) {
    return {
      churn_risk: "low",
      churn_signal: "Low star rating without explicit churn language",
      signal_type: "none",
    };
  }
  return {
    churn_risk: "none",
    churn_signal: "No material churn signal detected",
    signal_type: "none",
  };
}

async function upsertChurn(row: Omit<ChurnSignal, "id">) {
  if (isLocalMode()) {
    const db = readDb();
    const idx = db.churn_signals.findIndex(
      (c) => c.feedback_item_id === row.feedback_item_id
    );
    const full: ChurnSignal = {
      id: idx >= 0 ? db.churn_signals[idx].id : newId(),
      ...row,
      updated_at: new Date().toISOString(),
      created_at:
        idx >= 0
          ? db.churn_signals[idx].created_at
          : new Date().toISOString(),
    };
    if (idx >= 0) db.churn_signals[idx] = full;
    else db.churn_signals.push(full);
    writeDb(db);
    return;
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("churn_signals").upsert(
    {
      feedback_item_id: row.feedback_item_id,
      churn_risk: row.churn_risk,
      churn_signal: row.churn_signal,
      signal_type: row.signal_type,
      weighted_score: row.weighted_score,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "feedback_item_id" }
  );
  if (error) throw new Error(error.message);
}

export async function runChurn(opts?: {
  company?: string;
  limit?: number;
}): Promise<{ processed: number; jobId: string; mode: "claude" | "heuristic" }> {
  let items = await listFeedbackItems(
    opts?.company ? { companies: [opts.company] } : undefined
  );
  if (opts?.limit) items = items.slice(0, opts.limit);

  const job = await startJob("churn", items.length, opts?.company);
  let usage: TokenUsage = emptyUsage();
  const mode = hasAnthropicKey() ? "claude" : "heuristic";
  let processed = 0;

  try {
    await mapWithConcurrency(items, CONCURRENCY, async (item) => {
      let out: ChurnOut;
      if (hasAnthropicKey()) {
        const result = await cachedJsonCompletion({
          system: SYSTEM,
          user: JSON.stringify({
            company: item.company,
            source: item.source,
            rating: item.rating,
            text: item.text,
          }),
          schema: ChurnOutputSchema,
        });
        out = result.data;
        usage = mergeUsage(usage, result.usage);
      } else {
        out = heuristicChurn(item);
      }

      const weight = sourceWeight(item);
      const churn_risk = applyWeight(out.churn_risk, weight);
      const weighted_score = riskRank(churn_risk) * weight;

      await upsertChurn({
        feedback_item_id: item.id,
        churn_risk,
        churn_signal: out.churn_signal,
        signal_type: out.signal_type,
        weighted_score,
      });
      processed += 1;
      if (processed % 25 === 0) {
        console.log(`[churn] ${processed}/${items.length}`);
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
