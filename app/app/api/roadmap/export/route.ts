import { getRoadmap } from "@/lib/supabase/analysis-queries";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "csv";

  const items = await getRoadmap();

  if (format === "md") {
    const lines = ["# Product Roadmap — FlowStack", ""];
    for (const bucket of ["now", "next", "later"] as const) {
      lines.push(`## ${bucket.charAt(0).toUpperCase() + bucket.slice(1)}`, "");
      const bucketItems = items.filter((i) => i.bucket === bucket);
      for (const item of bucketItems) {
        const feat = item.feature_suggestions as {
          feature_name: string;
          description: string;
          impact_estimate: string;
          effort_size: string;
        };
        lines.push(
          `### ${feat.feature_name}`,
          "",
          feat.description,
          "",
          `- **Impact:** ${feat.impact_estimate}`,
          `- **Effort:** ${feat.effort_size}`,
          `- **Rationale:** ${item.rationale as string}`,
          ""
        );
      }
    }
    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": 'attachment; filename="roadmap.md"',
      },
    });
  }

  const rows = [
    ["bucket", "feature_name", "description", "impact", "effort", "rationale"],
  ];
  for (const item of items) {
    const feat = item.feature_suggestions as {
      feature_name: string;
      description: string;
      impact_estimate: string;
      effort_size: string;
    };
    rows.push([
      item.bucket as string,
      feat.feature_name,
      `"${feat.description.replace(/"/g, '""')}"`,
      feat.impact_estimate,
      feat.effort_size,
      `"${(item.rationale as string).replace(/"/g, '""')}"`,
    ]);
  }

  const csv = rows.map((r) => r.join(",")).join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="roadmap.csv"',
    },
  });
}
