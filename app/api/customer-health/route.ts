import { NextRequest, NextResponse } from "next/server";
import { getCustomerHealthBriefing } from "@/lib/actions/health";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const company = req.nextUrl.searchParams.get("company");
  if (!company) {
    return NextResponse.json({ error: "company query param required" }, { status: 400 });
  }
  try {
    const briefing = await getCustomerHealthBriefing({ company });
    return NextResponse.json(briefing);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
