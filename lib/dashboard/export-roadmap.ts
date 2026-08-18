/** Client-safe roadmap export helpers (no Node/fs imports). */

export function roadmapToCsv(
  rows: {
    bucket: string;
    feature_name: string;
    rationale: string;
    impact_score: number;
    effort_estimate: string;
  }[]
): string {
  const header = "bucket,feature_name,rationale,impact_score,effort_estimate";
  const lines = rows.map((r) =>
    [r.bucket, r.feature_name, r.rationale, r.impact_score, r.effort_estimate]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header, ...lines].join("\n");
}

export function roadmapToMarkdown(
  rows: {
    bucket: string;
    feature_name: string;
    rationale: string;
    impact_score: number;
    effort_estimate: string;
  }[]
): string {
  const sections = ["now", "next", "later"] as const;
  let md = `# Product Roadmap\n\nGenerated ${new Date().toISOString()}\n\n`;
  for (const s of sections) {
    md += `## ${s.charAt(0).toUpperCase() + s.slice(1)}\n\n`;
    for (const r of rows.filter((x) => x.bucket === s)) {
      md += `- **${r.feature_name}** (${r.effort_estimate}, impact ${r.impact_score}) — ${r.rationale}\n`;
    }
    md += "\n";
  }
  return md;
}
