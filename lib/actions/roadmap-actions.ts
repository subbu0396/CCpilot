import { isLocalMode, readDb, writeDb } from "@/lib/store/local-db";
import { createServiceClient } from "@/lib/supabase/client";
import { hasJiraCreds, createJiraIssue, transitionJiraIssue } from "@/lib/integrations/jira";
import type { RoadmapItem, Feature, Cluster } from "@/lib/supabase/types";

export async function getRoadmapItem(roadmapId: string): Promise<RoadmapItem | null> {
  if (isLocalMode()) {
    const db = readDb();
    return db.roadmap.find((r) => r.id === roadmapId) ?? null;
  }
  const supabase = createServiceClient();
  const { data } = await supabase.from("roadmap").select("*").eq("id", roadmapId).maybeSingle();
  return (data as RoadmapItem | null) ?? null;
}

export async function getRoadmapItemByJiraKey(jiraIssueKey: string): Promise<RoadmapItem | null> {
  if (isLocalMode()) {
    const db = readDb();
    return db.roadmap.find((r) => r.jira_issue_key === jiraIssueKey) ?? null;
  }
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("roadmap")
    .select("*")
    .eq("jira_issue_key", jiraIssueKey)
    .maybeSingle();
  return (data as RoadmapItem | null) ?? null;
}

/**
 * Jira -> CCPilot direction of the feedback loop (the reverse of
 * transitionJiraForRoadmap/createJiraForRoadmapItem, which push CCPilot
 * state into Jira). Called from the Jira webhook route when a linked
 * issue's status changes. No-op (returns null) if the issue isn't linked
 * to any roadmap item. Always records the raw status name; only moves the
 * bucket to "shipped" when Jira's status category is "done" — status
 * category is stable across custom workflow status names, unlike matching
 * on "Done"/"Resolved"/"Closed" strings. manually_overridden is set the
 * same way moveRoadmapItem's human drag-and-drop already does, so a
 * subsequent roadmap pipeline re-run's fresh items don't silently
 * overwrite it within the same run.
 */
export async function syncRoadmapFromJiraStatus({
  jira_issue_key,
  status_name,
  status_category,
}: {
  jira_issue_key: string;
  status_name: string;
  status_category?: string;
}): Promise<RoadmapItem | null> {
  const item = await getRoadmapItemByJiraKey(jira_issue_key);
  if (!item) return null;

  const patch: Partial<RoadmapItem> = {
    jira_status: status_name,
    updated_at: new Date().toISOString(),
  };
  if (status_category === "done" && item.bucket !== "shipped") {
    patch.bucket = "shipped";
    patch.manually_overridden = true;
  }

  if (isLocalMode()) {
    const db = readDb();
    const idx = db.roadmap.findIndex((r) => r.id === item.id);
    if (idx < 0) return null;
    db.roadmap[idx] = { ...db.roadmap[idx], ...patch };
    writeDb(db);
    return db.roadmap[idx];
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("roadmap")
    .update(patch as never)
    .eq("id", item.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as RoadmapItem;
}

export async function createJiraIssueStandalone({
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

export async function transitionJiraForRoadmap({
  issue_key,
  status,
}: {
  issue_key: string;
  status: string;
}) {
  if (!hasJiraCreds()) {
    throw new Error(
      "Jira is not configured — set JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN / JIRA_PROJECT_KEY."
    );
  }
  return transitionJiraIssue(issue_key, status);
}

/**
 * Creates a Jira issue for a roadmap item and persists the link back onto
 * the row. Single implementation shared by the roadmap PATCH route
 * (move-to-Now auto-create) and the standalone /api/jira create action.
 */
export async function createJiraForRoadmapItem(item: RoadmapItem) {
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

export async function linkJiraToRoadmapItem({
  roadmap_id,
  jira_issue_key,
  jira_issue_url,
}: {
  roadmap_id: string;
  jira_issue_key: string;
  jira_issue_url: string;
}) {
  if (isLocalMode()) {
    const db = readDb();
    const idx = db.roadmap.findIndex((r) => r.id === roadmap_id);
    if (idx < 0) throw new Error(`Roadmap item ${roadmap_id} not found.`);
    db.roadmap[idx] = { ...db.roadmap[idx], jira_issue_key, jira_issue_url };
    writeDb(db);
    return { id: db.roadmap[idx].id, jira_issue_key, jira_issue_url };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("roadmap")
    .update({ jira_issue_key, jira_issue_url } as never)
    .eq("id", roadmap_id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const updated = data as RoadmapItem;
  return { id: updated.id, jira_issue_key: updated.jira_issue_key, jira_issue_url: updated.jira_issue_url };
}
