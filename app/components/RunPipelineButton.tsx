"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const STAGES = [
  { id: "pain_points", label: "Pain points" },
  { id: "churn_risk", label: "Churn risk" },
  { id: "embeddings", label: "Embeddings" },
  { id: "clustering", label: "Clustering" },
  { id: "features", label: "Features" },
  { id: "roadmap", label: "Roadmap" },
] as const;

async function parseApiResponse(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (text.includes("An error occurred") || text.includes("FUNCTION_INVOCATION")) {
      throw new Error(
        "Request timed out on Vercel. The pipeline now runs in smaller batches — please retry. If it persists, upgrade to Vercel Pro for longer timeouts."
      );
    }
    throw new Error(text.slice(0, 200) || `Server error (${res.status})`);
  }
}

export function RunPipelineButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function runStage(
    pipelineRunId: string,
    stageId: string,
    stageLabel: string
  ) {
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      setProgress(`${stageLabel}…`);
      const res = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "stage",
          pipeline_run_id: pipelineRunId,
          stage: stageId,
          offset,
        }),
      });

      const data = await parseApiResponse(res);
      if (!res.ok) {
        throw new Error(String(data.error ?? `Stage ${stageId} failed`));
      }

      hasMore = Boolean(data.has_more);
      offset = Number(data.next_offset ?? 0);
    }
  }

  async function handleRun() {
    setRunning(true);
    setError(null);
    setDone(false);
    setProgress(null);
    setCurrentStage("Starting…");

    try {
      const startRes = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", clearPrevious: true }),
      });
      const startData = await parseApiResponse(startRes);
      if (!startRes.ok) {
        throw new Error(String(startData.error ?? "Failed to start"));
      }

      const pipelineRunId = startData.pipeline_run_id as string;

      for (const stage of STAGES) {
        setCurrentStage(stage.label);
        await runStage(pipelineRunId, stage.id, stage.label);
      }

      setDone(true);
      setCurrentStage(null);
      setProgress(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pipeline failed");
      setCurrentStage(null);
      setProgress(null);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void handleRun()}
        disabled={running}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {running ? "Running analysis…" : "Re-run analysis pipeline"}
      </button>

      {running && currentStage && (
        <p className="text-sm text-muted-foreground">
          Stage: {currentStage}
          {progress ? ` · ${progress}` : ""}
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {done && (
        <p className="text-sm text-green-700">
          Analysis complete. View results on Pain Points, Clusters, Features, or Roadmap.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Requires ANTHROPIC_API_KEY and VOYAGE_API_KEY. Also run migration{" "}
        <code>003_pipeline_payload.sql</code> in Supabase if not done yet.
      </p>
    </div>
  );
}
