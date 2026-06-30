export const dynamic = "force-dynamic";

import { RunPipelineButton } from "@/components/RunPipelineButton";
import {
  getIngestionRuns,
  getIngestionSummary,
} from "@/lib/supabase/queries";
import { getLatestPipelineRun } from "@/lib/supabase/analysis-queries";

export default async function IngestionAdminPage() {
  let summary: Awaited<ReturnType<typeof getIngestionSummary>> = [];
  let runs: Awaited<ReturnType<typeof getIngestionRuns>> = [];
  let pipelineRun: Awaited<ReturnType<typeof getLatestPipelineRun>> = null;
  let error: string | null = null;

  try {
    [summary, runs, pipelineRun] = await Promise.all([
      getIngestionSummary(),
      getIngestionRuns(),
      getLatestPipelineRun(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load";
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Ingestion & Analysis</h1>
        <p className="text-sm text-muted-foreground">
          Import status and analysis pipeline controls.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          {error}
        </div>
      )}

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-lg font-semibold">Analysis pipeline</h2>
        {pipelineRun && (
          <p className="mb-3 text-sm text-muted-foreground">
            Last run: {pipelineRun.status}{" "}
            {pipelineRun.completed_at
              ? `· ${new Date(pipelineRun.completed_at).toLocaleString()}`
              : pipelineRun.started_at
                ? `· started ${new Date(pipelineRun.started_at).toLocaleString()}`
                : ""}
            {pipelineRun.status === "failed" && pipelineRun.error_message && (
              <>
                <span className="mt-1 block text-destructive">
                  {pipelineRun.error_message.includes("payment method")
                    ? "Voyage AI rate limit — add billing at dashboard.voyageai.com, wait 5–10 min, then click Re-run below."
                    : pipelineRun.error_message.length > 280
                      ? `${pipelineRun.error_message.slice(0, 280)}…`
                      : pipelineRun.error_message}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  This message is from the previous failed run. Click Re-run after fixing the issue.
                </span>
              </>
            )}
          </p>
        )}
        <RunPipelineButton />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">By source</h2>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Source</th>
                <th className="px-4 py-2 text-left font-medium">Records</th>
                <th className="px-4 py-2 text-left font-medium">Last import</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr key={row.source} className="border-t">
                  <td className="px-4 py-2 capitalize">{row.source}</td>
                  <td className="px-4 py-2">{row.count}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {row.last_import
                      ? new Date(row.last_import).toLocaleString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Recent imports</h2>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Source</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Imported</th>
                <th className="px-4 py-2 text-left font-medium">Skipped</th>
                <th className="px-4 py-2 text-left font-medium">Started</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    No ingestion runs yet
                  </td>
                </tr>
              ) : (
                runs.map((run) => (
                  <tr key={run.id} className="border-t">
                    <td className="px-4 py-2 capitalize">{run.source}</td>
                    <td className="px-4 py-2">{run.status}</td>
                    <td className="px-4 py-2">{run.records_imported}</td>
                    <td className="px-4 py-2">{run.records_skipped}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(run.started_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
