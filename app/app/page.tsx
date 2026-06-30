import Link from "next/link";
import { getLatestPipelineRun } from "@/lib/supabase/analysis-queries";
import { getIngestionSummary } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let summary: Awaited<ReturnType<typeof getIngestionSummary>> = [];
  let pipelineRun: Awaited<ReturnType<typeof getLatestPipelineRun>> = null;
  let error: string | null = null;

  try {
    [summary, pipelineRun] = await Promise.all([
      getIngestionSummary(),
      getLatestPipelineRun(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load data";
  }

  const totalRecords = summary.reduce((n, s) => n + s.count, 0);

  const dashboards = [
    { href: "/pain-points", label: "Pain Points", desc: "Severity & sentiment" },
    { href: "/churn-risk", label: "Churn Risk", desc: "Customer risk signals" },
    { href: "/clusters", label: "Clusters", desc: "Themed feedback groups" },
    { href: "/features", label: "Features", desc: "Impact vs effort" },
    { href: "/roadmap", label: "Roadmap", desc: "Now / Next / Later" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Customer Intelligence Copilot
        </h1>
        <p className="mt-2 text-muted-foreground">
          Ingest multi-source feedback, analyze with Claude + Voyage AI, act on
          a prioritized roadmap.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(["ticket", "playstore", "call", "review"] as const).map((source) => {
          const row = summary.find((s) => s.source === source);
          return (
            <div key={source} className="rounded-lg border bg-card p-4 shadow-sm">
              <p className="text-sm font-medium capitalize text-muted-foreground">
                {source}
              </p>
              <p className="mt-1 text-2xl font-bold">{row?.count ?? 0}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Last import:{" "}
                {row?.last_import
                  ? new Date(row.last_import).toLocaleString()
                  : "—"}
              </p>
            </div>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground">
        Total feedback items: <strong>{totalRecords}</strong>
        {pipelineRun && (
          <>
            {" "}
            · Last analysis: <strong>{pipelineRun.status}</strong>
            {pipelineRun.completed_at &&
              ` (${new Date(pipelineRun.completed_at).toLocaleString()})`}
          </>
        )}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {dashboards.map((d) => (
          <Link
            key={d.href}
            href={d.href}
            className="rounded-lg border p-4 hover:border-primary hover:bg-muted/30"
          >
            <p className="font-medium">{d.label}</p>
            <p className="text-sm text-muted-foreground">{d.desc}</p>
          </Link>
        ))}
      </div>

      <div className="flex gap-3">
        <Link
          href="/upload"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Upload data
        </Link>
        <Link
          href="/admin/ingestion"
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Run analysis
        </Link>
      </div>
    </div>
  );
}
