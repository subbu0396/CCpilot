import { callClaudeJson } from "../claude";
import { kMeans, optimalK } from "../kmeans";
import { createServerClient } from "@/lib/supabase/client";
import { ClusterLabelResult } from "../schemas";
import { loadEmbeddings } from "./embeddings";
import type { FeedbackRow } from "../db";

const SYSTEM = `You are a product analyst labeling thematic clusters of customer feedback for FlowStack (B2B workflow SaaS).
Given sample quotes from a cluster, produce a concise label (3-6 words) and a 2-3 sentence summary of the theme and business impact.`;

const SCHEMA = `{ "label": "string", "summary": "string" }`;

export async function runClustering(
  items: FeedbackRow[],
  pipelineRunId: string
): Promise<number> {
  if (items.length === 0) return 0;

  const supabase = createServerClient();
  const itemIds = items.map((i) => i.id);
  const embedded = await loadEmbeddings(itemIds);

  if (embedded.length < 2) {
    if (embedded.length === 1) {
      await createSingleCluster(supabase, items, embedded[0].id, pipelineRunId);
      return 1;
    }
    return 0;
  }

  const k = optimalK(embedded.length);
  const vectors = embedded.map((e) => e.embedding);
  const assignments = kMeans(vectors, k);

  const clusterGroups = new Map<number, string[]>();
  for (let i = 0; i < embedded.length; i++) {
    const clusterIdx = assignments[i];
    const list = clusterGroups.get(clusterIdx) ?? [];
    list.push(embedded[i].id);
    clusterGroups.set(clusterIdx, list);
  }

  // Load pain points for avg severity
  const { data: painData } = await supabase
    .from("pain_points")
    .select("feedback_item_id, severity")
    .in("feedback_item_id", itemIds);

  const severityMap = new Map(
    (painData ?? []).map((p) => [p.feedback_item_id, p.severity as number])
  );

  let clustersCreated = 0;

  for (const memberIds of Array.from(clusterGroups.values())) {
    if (memberIds.length === 0) continue;

    const memberItems = items.filter((i) => memberIds.includes(i.id));
    const quotes = memberItems.slice(0, 5).map((i) => i.text.slice(0, 300));
    const severities = memberIds
      .map((id) => severityMap.get(id))
      .filter((s): s is number => s !== undefined);
    const avgSeverity =
      severities.length > 0
        ? severities.reduce((a, b) => a + b, 0) / severities.length
        : null;

    const labelResult = await callClaudeJson<{ label: string; summary: string }>({
      system: SYSTEM,
      user: `Label this cluster (${memberIds.length} items):\n${JSON.stringify({ quotes }, null, 2)}`,
      schemaHint: SCHEMA,
    });

    const parsed = ClusterLabelResult.safeParse(labelResult);
    if (!parsed.success) {
      throw new Error(`Cluster label validation failed: ${parsed.error.message}`);
    }

    const clusterId = crypto.randomUUID();
    await supabase.from("feedback_clusters").insert({
      id: clusterId,
      label: parsed.data.label,
      summary: parsed.data.summary,
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

    clustersCreated++;
  }

  return clustersCreated;
}

async function createSingleCluster(
  supabase: ReturnType<typeof createServerClient>,
  items: FeedbackRow[],
  itemId: string,
  pipelineRunId: string
) {
  const item = items.find((i) => i.id === itemId);
  if (!item) return;

  const clusterId = crypto.randomUUID();
  await supabase.from("feedback_clusters").insert({
    id: clusterId,
    label: "General feedback",
    summary: item.text.slice(0, 300),
    size: 1,
    sample_quotes: [item.text.slice(0, 300)],
    pipeline_run_id: pipelineRunId,
  });
  await supabase.from("cluster_members").insert({
    cluster_id: clusterId,
    feedback_item_id: itemId,
  });
}
