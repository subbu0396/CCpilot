import { callClaudeJson, chunk } from "../claude";
import { createServerClient } from "@/lib/supabase/client";
import {
  PainPointBatchResult,
  type PainPointExtraction,
} from "../schemas";
import type { FeedbackRow } from "../db";

const SYSTEM = `You are a product intelligence analyst for a B2B SaaS workflow automation platform called FlowStack.
Extract pain points from customer feedback. Be specific and actionable.
Product areas include: Onboarding, Integrations, Billing, Performance, Mobile, Security/SSO, Reporting, Automation, Support, General.
Severity: 1=trivial mention, 5=critical blocker or churn threat.
Sentiment: positive, neutral, negative, or mixed.`;

const SCHEMA = `{ "items": [{ "feedback_item_id": "uuid", "summary": "string", "severity": 1-5, "sentiment": "positive|neutral|negative|mixed", "product_area": "string" }] }`;

export async function runPainPointExtraction(
  items: FeedbackRow[]
): Promise<number> {
  if (items.length === 0) return 0;

  const supabase = createServerClient();
  const batches = chunk(items, 8);
  let processed = 0;

  for (const batch of batches) {
    const payload = batch.map((item) => ({
      feedback_item_id: item.id,
      source: item.source,
      text: item.text.slice(0, 2000),
      rating: item.rating,
    }));

    const result = await callClaudeJson<{ items: PainPointExtraction[] }>({
      system: SYSTEM,
      user: `Analyze these feedback items:\n${JSON.stringify(payload, null, 2)}`,
      schemaHint: SCHEMA,
    });

    const parsed = PainPointBatchResult.safeParse(result);
    if (!parsed.success) {
      throw new Error(`Pain point validation failed: ${parsed.error.message}`);
    }

    for (const pp of parsed.data.items) {
      const { error } = await supabase.from("pain_points").upsert(
        {
          feedback_item_id: pp.feedback_item_id,
          summary: pp.summary,
          severity: pp.severity,
          sentiment: pp.sentiment,
          product_area: pp.product_area,
          analyzed_at: new Date().toISOString(),
        },
        { onConflict: "feedback_item_id" }
      );
      if (!error) processed++;
    }
  }

  return processed;
}
