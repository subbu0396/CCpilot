export const dynamic = "force-dynamic";

import Link from "next/link";
import { getClusters } from "@/lib/supabase/analysis-queries";

export default async function ClustersPage() {
  let clusters: Awaited<ReturnType<typeof getClusters>> = [];
  let error: string | null = null;

  try {
    clusters = await getClusters();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load";
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Feedback Clusters</h1>
        <p className="text-sm text-muted-foreground">
          Themed groups from embedding similarity (Voyage AI + k-means).
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">{error}</div>
      )}

      {clusters.length === 0 ? (
        <p className="text-muted-foreground">No clusters yet. Run the analysis pipeline.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {clusters.map((cluster) => {
            const quotes = (cluster.sample_quotes as string[]) ?? [];
            return (
              <Link
                key={cluster.id}
                href={`/clusters/${cluster.id}`}
                className="rounded-lg border bg-card p-5 shadow-sm transition hover:border-primary"
              >
                <h2 className="text-lg font-semibold">{cluster.label as string}</h2>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                  {cluster.summary as string}
                </p>
                <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
                  <span>{cluster.size} items</span>
                  {cluster.avg_severity != null && (
                    <span>Avg severity: {Number(cluster.avg_severity).toFixed(1)}</span>
                  )}
                </div>
                {quotes[0] && (
                  <blockquote className="mt-3 border-l-2 pl-3 text-xs italic text-muted-foreground">
                    &ldquo;{quotes[0].slice(0, 120)}…&rdquo;
                  </blockquote>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
