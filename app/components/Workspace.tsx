"use client";

import { IntelligenceDashboard, type DashboardProps } from "@/components/IntelligenceDashboard";
import { RunPipelineButton } from "@/components/RunPipelineButton";
import { UploadPanel } from "@/components/UploadPanel";

type WorkspaceProps = DashboardProps & {
  pipelineError: string | null;
};

export function Workspace({ pipelineError, ...dashboard }: WorkspaceProps) {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col lg:flex-row">
      {/* Left: ingest + analyze */}
      <aside className="flex w-full shrink-0 flex-col border-b bg-slate-50/80 lg:w-[340px] lg:border-b-0 lg:border-r">
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          <UploadPanel />

          <div className="border-t pt-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Analyze
            </h2>
            <RunPipelineButton />
          </div>

          {pipelineError && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Last run: {pipelineError.slice(0, 200)}
              {pipelineError.length > 200 ? "…" : ""}
            </p>
          )}
        </div>

        <div className="hidden border-t p-3 text-[10px] text-muted-foreground lg:block">
          {dashboard.stats.totalFeedback} reviews · {dashboard.stats.clusterCount} themes
        </div>
      </aside>

      {/* Right: intelligence dashboard */}
      <section className="min-w-0 flex-1 overflow-hidden p-4 lg:p-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold tracking-tight">
            Customer intelligence
          </h1>
          <p className="text-sm text-muted-foreground">
            Themes, pain points, churn signals, and roadmap — updated after each analysis run.
          </p>
        </div>
        <IntelligenceDashboard {...dashboard} />
      </section>
    </div>
  );
}
