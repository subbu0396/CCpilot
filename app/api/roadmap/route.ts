import { NextRequest, NextResponse } from "next/server";
import { isLocalMode, readDb, writeDb } from "@/lib/store/local-db";
import { createServiceClient } from "@/lib/supabase/client";
import type { RoadmapBucket, RoadmapItem, Feature, Cluster } from "@/lib/supabase/types";
import { requireAdminAuth } from "@/lib/auth/admin";
import { hasJiraCreds, createJiraIssue } from "@/lib/integrations/jira";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Creates a Jira issue for a roadmap item moved into "Now" and persists the
 * link back onto the row. Best-effort: never throws — a Jira failure must
 * not undo or fail the bucket move that already succeeded in CCPilot,
 * matching the escalateZendeskTicket pattern in the Zendesk webhook route.
 */
async function createJiraForRoadmapItem(item: RoadmapItem) {
  if (!hasJiraCreds()) return;
  if (item.jira_issue_key) return; // already linked — don't duplicate on repeat moves

  try {
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

    if (!feature) return;

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
  } catch (err) {
    console.error(`[roadmap] Jira issue creation failed for roadmap item ${item.id}:`, err);
  }
}

export async function PATCH(req: NextRequest) {
  const authFail = await requireAdminAuth();
  if (authFail) return authFail;

  try {
    const body = await req.json();
    const id = String(body.id);
    const bucket = body.bucket as RoadmapBucket;
    const sort_order = Number(body.sort_order ?? 0);

    if (!["now", "next", "later"].includes(bucket)) {
      return NextResponse.json({ error: "invalid bucket" }, { status: 400 });
    }

    let updated: RoadmapItem;

    if (isLocalMode()) {
      const db = readDb();
      const idx = db.roadmap.findIndex((r) => r.id === id);
      if (idx < 0) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      db.roadmap[idx] = {
        ...db.roadmap[idx],
        bucket,
        sort_order,
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
          sort_order,
          manually_overridden: true,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      updated = data as RoadmapItem;
    }

    if (bucket === "now") {
      await createJiraForRoadmapItem(updated);
      // Re-read so the response (and the client's refresh) reflects the linked issue.
      if (isLocalMode()) {
        updated = readDb().roadmap.find((r) => r.id === id) ?? updated;
      } else {
        const supabase = createServiceClient();
        const { data } = await supabase.from("roadmap").select("*").eq("id", id).single();
        if (data) updated = data as RoadmapItem;
      }
    }

    return NextResponse.json({ ok: true, item: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
