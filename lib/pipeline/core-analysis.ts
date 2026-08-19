import { CoreAnalysisOutputSchema } from "@/lib/ingestion/schema";
import type { FeedbackItem, CoreAnalysis } from "@/lib/supabase/types";
import { isLocalMode, readDb, writeDb, newId } from "@/lib/store/local-db";
import { createServiceClient } from "@/lib/supabase/client";
import { cachedJsonCompletion, hasAnthropicKey, type TokenUsage } from "./claude";
import { z } from "zod";

const SYSTEM = `You are the Core Analysis Agent in an automated customer feedback pipeline. Your job is to process raw customer feedback texts, identify churn risks, extract core friction points, and output structured JSON.

### Rules:
1. Return ONLY a valid JSON object. No markdown wrapping (do not use \`\`\`json), no conversational preamble, and no postscript.
2. Be highly objective. Do not overestimate risk based on polite criticism, but heavily weight indicators of feature abandonment, cancellation mentions, or broken core workflows.

### Expected Output Schema:
{
  "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE",
  "churn_risk_score": 0.00 to 1.00, // Float scale. 0.0 = completely satisfied, 1.0 = explicit threat to cancel.
  "primary_pain_point": "String summarizing the single biggest issue",
  "category": "UI/UX" | "PERFORMANCE" | "BILLING" | "FEATURE_REQUEST" | "BUG" | "OTHER",
  "key_quotes": ["Array of short, exact text snippets showing the pain point"],
  "actionable_recommendation": "One sentence product roadmap feature recommendation to fix this issue",
  "zendesk_priority_escalation": true | false // True if churn_risk_score >= 0.75 or if critical bug
}`;

type CoreAnalysisOut = z.infer<typeof CoreAnalysisOutputSchema>;

async function upsertCoreAnalysis(
  row: Omit<CoreAnalysis, "id">
): Promise<CoreAnalysis> {
  if (isLocalMode()) {
    const db = readDb();
    const idx = db.core_analysis.findIndex(
      (c) => c.feedback_item_id === row.feedback_item_id
    );
    const full: CoreAnalysis = {
      id: idx >= 0 ? db.core_analysis[idx].id : newId(),
      ...row,
      updated_at: new Date().toISOString(),
      created_at:
        idx >= 0 ? db.core_analysis[idx].created_at : new Date().toISOString(),
    };
    if (idx >= 0) db.core_analysis[idx] = full;
    else db.core_analysis.push(full);
    writeDb(db);
    return full;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("core_analysis")
    .upsert(
      {
        feedback_item_id: row.feedback_item_id,
        sentiment: row.sentiment,
        churn_risk_score: row.churn_risk_score,
        primary_pain_point: row.primary_pain_point,
        category: row.category,
        key_quotes: row.key_quotes,
        actionable_recommendation: row.actionable_recommendation,
        zendesk_priority_escalation: row.zendesk_priority_escalation,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "feedback_item_id" }
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CoreAnalysis;
}

/**
 * Runs the Core Analysis Agent on a single feedback item (webhook / real-time
 * path — unlike the batch pain-points/churn stages, this is meant to be
 * called inline per incoming ticket, not fanned out over the whole table).
 */
export async function runCoreAnalysis(
  item: FeedbackItem,
  meta: { source: string; customerTier: string }
): Promise<{ result: CoreAnalysisOut; usage: TokenUsage | null; row: CoreAnalysis }> {
  if (!hasAnthropicKey()) {
    throw new Error("ANTHROPIC_API_KEY missing — Core Analysis Agent requires Claude");
  }

  const user = `### Input Metadata to Consider:
- Source: ${meta.source}
- Customer Tier: ${meta.customerTier}

### Raw Customer Feedback to Analyze:
${item.text}`;

  const { data, usage } = await cachedJsonCompletion({
    system: SYSTEM,
    user,
    schema: CoreAnalysisOutputSchema,
  });

  const row = await upsertCoreAnalysis({
    feedback_item_id: item.id,
    sentiment: data.sentiment,
    churn_risk_score: data.churn_risk_score,
    primary_pain_point: data.primary_pain_point,
    category: data.category,
    key_quotes: data.key_quotes,
    actionable_recommendation: data.actionable_recommendation,
    zendesk_priority_escalation: data.zendesk_priority_escalation,
  });

  return { result: data, usage, row };
}
