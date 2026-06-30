import { callClaudeJson } from "../claude";
import { createServerClient } from "@/lib/supabase/client";
import { RoadmapBatchResult } from "../schemas";

const SYSTEM = `You are a product leader prioritizing a roadmap for FlowStack using Now/Next/Later framework.
Now = urgent, high-impact, small-to-medium effort. Next = important but not urgent. Later = valuable but lower priority or large effort.
Assign every feature to exactly one bucket with clear rationale.`;

const SCHEMA = `{ "items": [{ "feature_name": "string", "bucket": "now|next|later", "rationale": "string" }] }`;

export async function runRoadmapGeneration(
  pipelineRunId: string
): Promise<number> {
  const supabase = createServerClient();
  const { data: features, error } = await supabase
    .from("feature_suggestions")
    .select("id, feature_name, description, impact_estimate, effort_size")
    .eq("pipeline_run_id", pipelineRunId);

  if (error) throw error;
  if (!features?.length) return 0;

  const result = await callClaudeJson<{
    items: { feature_name: string; bucket: "now" | "next" | "later"; rationale: string }[];
  }>({
    system: SYSTEM,
    user: `Prioritize these features:\n${JSON.stringify(features, null, 2)}`,
    schemaHint: SCHEMA,
  });

  const parsed = RoadmapBatchResult.safeParse(result);
  if (!parsed.success) {
    throw new Error(`Roadmap validation failed: ${parsed.error.message}`);
  }

  let order = 0;
  let created = 0;

  for (const item of parsed.data.items) {
    const feature = features.find((f) => f.feature_name === item.feature_name);
    if (!feature) continue;

    const bucketOrder = { now: 0, next: 100, later: 200 };
    const { error: insertErr } = await supabase.from("roadmap_items").upsert(
      {
        feature_id: feature.id,
        bucket: item.bucket,
        rationale: item.rationale,
        sort_order: bucketOrder[item.bucket] + order++,
      },
      { onConflict: "feature_id" }
    );
    if (!insertErr) created++;
  }

  return created;
}
