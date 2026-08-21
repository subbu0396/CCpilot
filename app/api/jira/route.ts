import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth/admin";
import {
  getRoadmapItem,
  createJiraForRoadmapItem,
  linkJiraToRoadmapItem,
  transitionJiraForRoadmap,
} from "@/lib/actions/roadmap-actions";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(req: NextRequest) {
  const authFail = await requireAdminAuth();
  if (authFail) return authFail;

  try {
    const body = await req.json();

    if (body.action === "create") {
      const roadmapId = String(body.roadmap_id ?? "");
      const item = await getRoadmapItem(roadmapId);
      if (!item) return NextResponse.json({ error: "Roadmap item not found" }, { status: 404 });
      const jira = await createJiraForRoadmapItem(item);
      if (!jira) {
        return NextResponse.json(
          { error: "Jira is not configured, or the linked feature could not be found." },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: true, jira_issue_key: jira.key, jira_issue_url: jira.url });
    }

    if (body.action === "link") {
      const result = await linkJiraToRoadmapItem({
        roadmap_id: String(body.roadmap_id ?? ""),
        jira_issue_key: String(body.jira_issue_key ?? ""),
        jira_issue_url: String(body.jira_issue_url ?? ""),
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "transition") {
      const result = await transitionJiraForRoadmap({
        issue_key: String(body.issue_key ?? ""),
        status: String(body.status ?? ""),
      });
      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
