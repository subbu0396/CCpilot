import { NextRequest, NextResponse } from "next/server";
import {
  verifyJiraWebhookToken,
  hasJiraWebhookSecret,
  parseJiraWebhookPayload,
  type JiraWebhookPayload,
} from "@/lib/ingestion/jira-webhook";
import { syncRoadmapFromJiraStatus } from "@/lib/actions/roadmap-actions";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(req: NextRequest) {
  if (!hasJiraWebhookSecret()) {
    return NextResponse.json({ error: "JIRA_WEBHOOK_SECRET not configured" }, { status: 500 });
  }

  const verified = verifyJiraWebhookToken({
    token: req.nextUrl.searchParams.get("token"),
    secret: process.env.JIRA_WEBHOOK_SECRET!,
  });
  if (!verified) {
    return NextResponse.json({ error: "Invalid or missing token" }, { status: 401 });
  }

  let payload: JiraWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseJiraWebhookPayload(payload);
  if (!parsed) {
    return NextResponse.json({ ok: true, skipped: "no issue/status in payload" });
  }

  try {
    const updated = await syncRoadmapFromJiraStatus({
      jira_issue_key: parsed.issue_key,
      status_name: parsed.status_name,
      status_category: parsed.status_category,
    });
    if (!updated) {
      return NextResponse.json({ ok: true, skipped: `${parsed.issue_key} not linked to a roadmap item` });
    }
    return NextResponse.json({ ok: true, roadmap_id: updated.id, bucket: updated.bucket, jira_status: updated.jira_status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
