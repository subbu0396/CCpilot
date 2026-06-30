export const dynamic = "force-dynamic";

import { getRoadmap } from "@/lib/supabase/analysis-queries";

const BUCKETS = [
  { id: "now", label: "Now", color: "border-green-300 bg-green-50" },
  { id: "next", label: "Next", color: "border-blue-300 bg-blue-50" },
  { id: "later", label: "Later", color: "border-gray-300 bg-gray-50" },
] as const;

export default async function RoadmapPage() {
  let items: Awaited<ReturnType<typeof getRoadmap>> = [];
  let error: string | null = null;

  try {
    items = await getRoadmap();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load";
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Product Roadmap</h1>
          <p className="text-sm text-muted-foreground">
            Now / Next / Later prioritization from Claude analysis.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/api/roadmap/export?format=csv"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Export CSV
          </a>
          <a
            href="/api/roadmap/export?format=md"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Export Markdown
          </a>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">{error}</div>
      )}

      {items.length === 0 ? (
        <p className="text-muted-foreground">No roadmap items yet. Run the analysis pipeline.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {BUCKETS.map((bucket) => {
            const bucketItems = items.filter((i) => i.bucket === bucket.id);
            return (
              <div
                key={bucket.id}
                className={`rounded-lg border-2 p-4 ${bucket.color}`}
              >
                <h2 className="mb-4 text-lg font-semibold">{bucket.label}</h2>
                <ul className="space-y-3">
                  {bucketItems.length === 0 ? (
                    <li className="text-sm text-muted-foreground">Empty</li>
                  ) : (
                    bucketItems.map((item) => {
                      const feat = item.feature_suggestions as {
                        feature_name: string;
                        description: string;
                        impact_estimate: string;
                        effort_size: string;
                      } | undefined;
                      if (!feat) return null;
                      return (
                        <li
                          key={item.id as string}
                          className="rounded-md border bg-white p-3 shadow-sm"
                        >
                          <p className="font-medium">{feat.feature_name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {feat.description}
                          </p>
                          <p className="mt-2 text-xs">
                            Impact: {feat.impact_estimate} · Effort: {feat.effort_size}
                          </p>
                          <p className="mt-2 text-xs italic text-muted-foreground">
                            {item.rationale as string}
                          </p>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
