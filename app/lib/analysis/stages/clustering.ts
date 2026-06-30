import { callClaudeJson } from "../claude";
import { kMeans, optimalK } from "../kmeans";
import { createServerClient } from "@/lib/supabase/client";
import { ClusterLabelResult } from "../schemas";
import { loadEmbeddings } from "./embeddings";
import type { FeedbackRow } from "../db";

const SYSTEM = `You are a product analyst labeling thematic clusters of customer feedback for FlowStack (B2B workflow SaaS).
Given sample quotes from a cluster, produce a concise label (3-6 words) and a 2-3 sentence summary of the theme and business impact.`;

const SCHEMA = `{ "label": "string", "summary": "string" }`;

type ClusterGroups = string[][];

async function getClusterGroups(
  items: FeedbackRow[],
  pipelineRunId: string
): Promise<ClusterGroups> {
  const supabase = createServerClient();
  const { data: run } = await supabase
    .from("analysis_pipeline_runs")
    .select("payload")
    .eq("id", pipelineRunId)
    .single();

  const payload = (run?.payload ?? {}) as { cluster_groups?: ClusterGroups };
  if (payload.cluster_groups?.length) {
    return payload.cluster_groups;
  }

  const itemIds = items.map((i) => i.id);
  const embedded = await loadEmbeddings(itemIds);

  if (embedded.length < 2) {
    const groups = embedded.length === 1 ? [[embedded[0].id]] : [];
    await supabase
      .from("analysis_pipeline_runs")
      .update({ payload: { cluster_groups: groups } })
      .eq("id", pipelineRunId);
    return groups;
  }

  const k = optimalK(embedded.length);
  const vectors = embedded.map((e) => e.embedding);
  const assignments = kMeans(vectors, k);

  const clusterGroups: ClusterGroups = [];
  for (let i = 0; i < embedded.length; i++) {
    const idx = assignments[i];
    if (!clusterGroups[idx]) clusterGroups[idx] = [];
    clusterGroups[idx].push(embedded[i].id);
  }

  const groups = clusterGroups.filter((g) => g && g.length > 0);
  await supabase
    .from("analysis_pipeline_runs")
    .update({ payload: { cluster_groups: groups } })
    .eq("id", pipelineRunId);

  return groups;
}

async function labelCluster(
  memberIds: string[],
  items: FeedbackRow[],
  pipelineRunId: string
): Promise<number> {
  const supabase = createServerClient();
  const memberItems = items.filter((i) => memberIds.includes(i.id));
  const quotes = memberItems.slice(0, 5).map((i) => i.text.slice(0, 300));

  const { data: painData } = await supabase
    .from("pain_points")
    .select("feedback_item_id, severity")
    .in("feedback_item_id", memberIds);

  const severities = (painData ?? [])
    .map((p) => p.severity as number)
    .filter((s) => s !== undefined);
  const avgSeverity =
    severities.length > 0
      ? severities.reduce((a, b) => a + b, 0) / severities.length
      : null;

  let label = "General feedback";
  let summary = quotes[0] ?? "Mixed customer feedback";

  if (memberIds.length > 1 || quotes[0]) {
    const labelResult = await callClaudeJson<{ label: string; summary: string }>({
      system: SYSTEM,
      user: `Label this cluster (${memberIds.length} items):\n${JSON.stringify({ quotes }, null, 2)}`,
      schemaHint: SCHEMA,
    });
    const parsed = ClusterLabelResult.safeParse(labelResult);
    if (!parsed.success) {
      throw new Error(`Cluster label validation failed: ${parsed.error.message}`);
    }
    label = parsed.data.label;
    summary = parsed.data.summary;
  }

  const clusterId = crypto.randomUUID();
  await supabase.from("feedback_clusters").insert({
    id: clusterId,
    label,
    summary,
    size: memberIds.length,
    avg_severity: avgSeverity,
    sample_quotes: quotes,
    pipeline_run_id: pipelineRunId,
  });

  for (const fid of memberIds) {
    await supabase.from("cluster_members").upsert({
      cluster_id: clusterId,
      feedback_item_id: fid,
    });
  }

  return 1;
}

export async function runClusteringBatch(
  items: FeedbackRow[],
  pipelineRunId: string,
  clusterIndex: number
): Promise<{ processed: number; has_more: boolean; next_offset: number }> {
  const groups = await getClusterGroups(items, pipelineRunId);

  if (groups.length === 0) {
    return { processed: 0, has_more: false, next_offset: 0 };
  }

  if (clusterIndex >= groups.length) {
    return { processed: 0, has_more: false, next_offset: clusterIndex };
  }

  const processed = await labelCluster(
    groups[clusterIndex],
    items,
    pipelineRunId
  );

  const next = clusterIndex + 1;
  return {
    processed,
    has_more: next < groups.length,
    next_offset: next,
  };
}

export async function runClustering(
  items: FeedbackRow[],
  pipelineRunId: string
): Promise<number> {
  let total = 0;
  let idx = 0;
  let result = await runClusteringBatch(items, pipelineRunId, idx);
  total += result.processed;
  while (result.has_more) {
    idx = result.next_offset;
    result = await runClusteringBatch(items, pipelineRunId, idx);
    total += result.processed;
  }
  return total;
}
