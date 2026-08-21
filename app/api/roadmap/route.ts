import { NextRequest, NextResponse } from "next/server";
import { isLocalMode, readDb, writeDb } from "@/lib/store/local-db";
import { createServiceClient } from "@/lib/supabase/client";
import type { RoadmapBucket, RoadmapItem } from "@/lib/supabase/types";
import { requireAdminAuth } from "@/lib/auth/admin";
import { createJiraForRoadmapItem as createJiraForRoadmapItemShared } from "@/lib/actions/roadmap-actions";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Best-effort wrapper: a Jira failure must not undo or fail the bucket move
 * that already succeeded in CCPilot, matching the escalateZendeskTicket
 * pattern in the Zendesk webhook route.
 */
async function createJiraForRoadmapItem(item: RoadmapItem) {
  try {
    await createJiraForRoadmapItemShared(item);
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
