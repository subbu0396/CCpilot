import {
  PainPointOutputSchema,
} from "@/lib/ingestion/schema";
import type { FeedbackItem, PainPoint } from "@/lib/supabase/types";
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

const SYSTEM = `You are a product analyst extracting structured pain points from customer feedback.
Return ONLY valid JSON matching:
{
  "pain_point_summary": "one crisp sentence",
  "severity": 1|2|3|4|5,
  "sentiment": "positive"|"neutral"|"negative",
  "product_area": "short area label e.g. Onboarding, Billing, Performance"
}
Be precise. Positive feedback can still have low-severity observations.`;

type PainOut = z.infer<typeof PainPointOutputSchema>;

function heuristicPainPoint(item: FeedbackItem): PainOut {
  const text = item.text.toLowerCase();
  const negative =
    /cancel|frustrat|broken|bug|slow|timeout|duplicate|confus|missing|cannot|can't|won't renew|evaluating|switch|escalat/.test(
      text
    );
  const positive =
    /love|great|excellent|saved|polished|best|faster|win|amazing/.test(text);

  let sentiment: PainOut["sentiment"] = "neutral";
  if (positive && !negative) sentiment = "positive";
  else if (negative) sentiment = "negative";

  let severity: PainOut["severity"] = 3;
  if (item.rating !== null) {
    if (item.rating <= 2) severity = 5;
    else if (item.rating === 3) severity = 3;
    else severity = 1;
  } else if (negative) severity = 4;
  else if (positive) severity = 1;

  if (/cancel|won't renew|evaluating|switch/.test(text)) severity = 5;

  const areas = [
    "Onboarding",
    "Permissions",
    "Mobile Sync",
    "Reporting",
    "Integrations",
    "Deal Pipeline",
    "Performance",
    "Dashboard UX",
    "Exports",
    "Billing",
  ];
  const product_area =
    areas.find((a) => text.includes(a.toLowerCase())) ||
    areas.find((a) =>
      text.includes(a.toLowerCase().split(" ")[0]!)
    ) ||
    (item.company === "Flowdesk"
      ? "Onboarding"
      : item.company === "Trackr"
        ? "Reporting"
        : "Performance");

  const firstSentence = item.text.split(/[.\n]/)[0]?.trim() || item.text;
  return {
    pain_point_summary: firstSentence.slice(0, 180),
    severity,
    sentiment,
    product_area,
  };
}

async function upsertPainPoint(row: Omit<PainPoint, "id"> & { id?: string }) {
  if (isLocalMode()) {
    const db = readDb();
    const idx = db.pain_points.findIndex(
      (p) => p.feedback_item_id === row.feedback_item_id
    );
    const full: PainPoint = {
      id: idx >= 0 ? db.pain_points[idx].id : newId(),
      ...row,
      updated_at: new Date().toISOString(),
      created_at:
        idx >= 0
          ? db.pain_points[idx].created_at
          : new Date().toISOString(),
    };
    if (idx >= 0) db.pain_points[idx] = full;
    else db.pain_points.push(full);
    writeDb(db);
    return;
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("pain_points").upsert(
    {
      feedback_item_id: row.feedback_item_id,
      pain_point_summary: row.pain_point_summary,
      severity: row.severity,
      sentiment: row.sentiment,
      product_area: row.product_area,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "feedback_item_id" }
  );
  if (error) throw new Error(error.message);
}

export async function runPainPoints(opts?: {
  company?: string;
  limit?: number;
}): Promise<{ processed: number; jobId: string; mode: "claude" | "heuristic" }> {
  let items = await listFeedbackItems(
    opts?.company ? { companies: [opts.company] } : undefined
  );
  if (opts?.limit) items = items.slice(0, opts.limit);

  const job = await startJob("pain_points", items.length, opts?.company);
  let usage: TokenUsage = emptyUsage();
  const mode = hasAnthropicKey() ? "claude" : "heuristic";
  let processed = 0;

  try {
    await mapWithConcurrency(items, CONCURRENCY, async (item) => {
      let out: PainOut;
      if (hasAnthropicKey()) {
        const result = await cachedJsonCompletion({
          system: SYSTEM,
          user: JSON.stringify({
            company: item.company,
            source: item.source,
            rating: item.rating,
            text: item.text,
          }),
          schema: PainPointOutputSchema,
        });
        out = result.data;
        usage = mergeUsage(usage, result.usage);
      } else {
        out = heuristicPainPoint(item);
      }

      await upsertPainPoint({
        feedback_item_id: item.id,
        pain_point_summary: out.pain_point_summary,
        severity: out.severity,
        sentiment: out.sentiment,
        product_area: out.product_area,
      });
      processed += 1;
      if (processed % 25 === 0) {
        console.log(`[pain_points] ${processed}/${items.length}`);
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
