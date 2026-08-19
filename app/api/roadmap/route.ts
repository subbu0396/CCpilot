import { NextRequest, NextResponse } from "next/server";
import { isLocalMode, readDb, writeDb } from "@/lib/store/local-db";
import { createServiceClient } from "@/lib/supabase/client";
import type { RoadmapBucket } from "@/lib/supabase/types";
import { requireAdminAuth } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

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
      return NextResponse.json({ ok: true, item: db.roadmap[idx] });
    }

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
    return NextResponse.json({ ok: true, item: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
