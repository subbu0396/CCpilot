import { isLocalMode, readDb, writeDb } from "@/lib/store/local-db";
import { createServiceClient } from "@/lib/supabase/client";
import type { RoadmapBucket, RoadmapItem } from "@/lib/supabase/types";
import {
  createJiraIssueStandalone,
  transitionJiraForRoadmap,
  createJiraForRoadmapItem,
  linkJiraToRoadmapItem,
} from "@/lib/actions/roadmap-actions";

export const createJiraIssueTool = createJiraIssueStandalone;
export const transitionJiraIssueTool = transitionJiraForRoadmap;
export const linkJiraIssue = linkJiraToRoadmapItem;

export async function moveRoadmapItem({
  roadmap_id,
  bucket,
}: {
  roadmap_id: string;
  bucket: RoadmapBucket;
}) {
  if (!["now", "next", "later", "shipped"].includes(bucket)) {
    throw new Error(`Invalid bucket "${bucket}" — must be now, next, later, or shipped.`);
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
