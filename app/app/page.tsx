import Link from "next/link";
import { getIngestionSummary } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let summary: Awaited<ReturnType<typeof getIngestionSummary>> = [];
  let error: string | null = null;

  try {
    summary = await getIngestionSummary();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load data";
  }

  const totalRecords = summary.reduce((n, s) => n + s.count, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Customer Intelligence Copilot
        </h1>
        <p className="mt-2 text-muted-foreground">
          Portfolio demo — ingest feedback from four sources via MCP, store in
          Supabase, analyze with Claude (pipeline coming next).
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Supabase not configured or schema not applied: {error}
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
      </p>

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
          Ingestion status
        </Link>
      </div>
    </div>
  );
}
