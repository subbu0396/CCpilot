import { callClaudeJson } from "../claude";
import { createServerClient } from "@/lib/supabase/client";
import { FeatureBatchResult } from "../schemas";

const SYSTEM = `You are a product manager translating customer feedback clusters into feature opportunities for FlowStack.
Suggest concrete features with impact (low/medium/high) and effort t-shirt size (S/M/L/XL).
Focus on outcomes, not implementation details.`;

const SCHEMA = `{ "features": [{ "feature_name": "string", "description": "string", "impact_estimate": "low|medium|high", "effort_size": "S|M|L|XL" }] }`;

type ClusterRow = {
  id: string;
  label: string;
  summary: string;
  sample_quotes: string[];
  size: number;
  avg_severity: number | null;
};

export async function runFeatureBatch(
  pipelineRunId: string,
  clusterIndex: number
): Promise<{ processed: number; has_more: boolean; next_offset: number }> {
  const supabase = createServerClient();
  const { data: clusters, error } = await supabase
    .from("feedback_clusters")
    .select("id, label, summary, sample_quotes, size, avg_severity")
    .eq("pipeline_run_id", pipelineRunId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!clusters?.length || clusterIndex >= clusters.length) {
    return { processed: 0, has_more: false, next_offset: clusterIndex };
  }

  const cluster = clusters[clusterIndex] as ClusterRow;
  const result = await callClaudeJson<{
    features: {
      feature_name: string;
      description: string;
      impact_estimate: "low" | "medium" | "high";
      effort_size: "S" | "M" | "L" | "XL";
    }[];
  }>({
    system: SYSTEM,
    user: `Extract 1-3 feature suggestions from this cluster:\n${JSON.stringify(cluster, null, 2)}`,
    schemaHint: SCHEMA,
  });

  const parsed = FeatureBatchResult.safeParse(result);
  if (!parsed.success) {
    throw new Error(`Feature validation failed: ${parsed.error.message}`);
  }

  let processed = 0;
  for (const feat of parsed.data.features) {
    const { error: insertErr } = await supabase
      .from("feature_suggestions")
      .insert({
        cluster_id: cluster.id,
        feature_name: feat.feature_name,
        description: feat.description,
        impact_estimate: feat.impact_estimate,
        effort_size: feat.effort_size,
        pipeline_run_id: pipelineRunId,
      });
    if (!insertErr) processed++;
  }

  const next = clusterIndex + 1;
  return {
    processed,
    has_more: next < clusters.length,
    next_offset: next,
  };
}

export async function runFeatureExtraction(
  pipelineRunId: string
): Promise<number> {
  let total = 0;
  let idx = 0;
  let result = await runFeatureBatch(pipelineRunId, idx);
  total += result.processed;
  while (result.has_more) {
    idx = result.next_offset;
    result = await runFeatureBatch(pipelineRunId, idx);
    total += result.processed;
  }
  return total;
}
