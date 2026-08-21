import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth/admin";
import { explainRoadmapItem } from "@/lib/actions/explain";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(req: NextRequest) {
  const authFail = await requireAdminAuth();
  if (authFail) return authFail;

  try {
    const body = await req.json();
    const roadmap_id = String(body.roadmap_id ?? "");
    const compare_to_id = typeof body.compare_to_id === "string" ? body.compare_to_id : undefined;
    if (!roadmap_id) {
      return NextResponse.json({ error: "roadmap_id required" }, { status: 400 });
    }
    const result = await explainRoadmapItem({ roadmap_id, compare_to_id });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
