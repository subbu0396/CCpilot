import { isLocalMode, readDb, writeDb } from "@/lib/store/local-db";
import { createServiceClient } from "@/lib/supabase/client";
import { hasJiraCreds, createJiraIssue } from "@/lib/integrations/jira";
import type { RoadmapBucket, RoadmapItem, Feature, Cluster } from "@/lib/supabase/types";

export async function createJiraIssueTool({
  summary,
  description,
  labels,
}: {
  summary: string;
  description: string;
  labels?: string[];
}) {
  if (!hasJiraCreds()) {
    throw new Error(
      "Jira is not configured — set JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN / JIRA_PROJECT_KEY."
    );
  }
  return createJiraIssue({ summary, description, labels: labels ?? ["ccpilot"] });
}

/**
 * Mirrors createJiraForRoadmapItem() in app/api/roadmap/route.ts — duplicated
 * rather than imported since that file also pulls in requireAdminAuth()
 * (Next.js request-bound), which this standalone process doesn't have or need.
 */
async function createJiraForRoadmapItem(item: RoadmapItem) {
  if (!hasJiraCreds()) return null;
  if (item.jira_issue_key) return { key: item.jira_issue_key, url: item.jira_issue_url };

  let feature: Feature | null = null;
  let cluster: Cluster | null = null;

  if (isLocalMode()) {
    const db = readDb();
    feature = db.features.find((f) => f.id === item.feature_id) ?? null;
    if (feature) cluster = db.clusters.find((c) => c.id === feature!.cluster_id) ?? null;
  } else {
    const supabase = createServiceClient();
    const { data: featureData } = await supabase
      .from("features")
      .select("*")
      .eq("id", item.feature_id)
      .maybeSingle();
    feature = (featureData as Feature | null) ?? null;
    if (feature) {
      const { data: clusterData } = await supabase
        .from("clusters")
        .select("*")
        .eq("id", feature.cluster_id)
        .maybeSingle();
      cluster = (clusterData as Cluster | null) ?? null;
    }
  }

  if (!feature) return null;

  const description = [
    feature.description,
    item.rationale ? `Rationale: ${item.rationale}` : null,
    cluster ? `Source theme: ${cluster.cluster_label}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const { key, url } = await createJiraIssue({
    summary: feature.feature_name,
    description,
    labels: ["ccpilot"],
  });

  if (isLocalMode()) {
    const db = readDb();
    const idx = db.roadmap.findIndex((r) => r.id === item.id);
    if (idx >= 0) {
      db.roadmap[idx] = { ...db.roadmap[idx], jira_issue_key: key, jira_issue_url: url };
      writeDb(db);
    }
  } else {
    const supabase = createServiceClient();
    await supabase
      .from("roadmap")
      .update({ jira_issue_key: key, jira_issue_url: url } as never)
      .eq("id", item.id);
  }

  return { key, url };
}

export async function moveRoadmapItem({
  roadmap_id,
  bucket,
}: {
  roadmap_id: string;
  bucket: RoadmapBucket;
}) {
  if (!["now", "next", "later"].includes(bucket)) {
    throw new Error(`Invalid bucket "${bucket}" — must be now, next, or later.`);
  }

  let updated: RoadmapItem;

  if (isLocalMode()) {
    const db = readDb();
    const idx = db.roadmap.findIndex((r) => r.id === roadmap_id);
    if (idx < 0) throw new Error(`Roadmap item ${roadmap_id} not found.`);
    db.roadmap[idx] = {
      ...db.roadmap[idx],
      bucket,
      manually_overridden: true,
      updated_at: new Date().toISOString(),
    };
    writeDb(db);
    updated = db.roadmap[idx];
  } else {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("roadmap")
      .update({
        bucket,
        manually_overridden: true,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", roadmap_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    updated = data as RoadmapItem;
  }

  let jira: { key: string; url: string | null } | null = null;
  if (bucket === "now") {
    jira = await createJiraForRoadmapItem(updated);
  }

  return {
    id: updated.id,
    bucket: updated.bucket,
    jira_issue_key: jira?.key ?? updated.jira_issue_key,
    jira_issue_url: jira?.url ?? updated.jira_issue_url,
  };
}
