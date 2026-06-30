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

export function RunPipelineButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleRun() {
    setRunning(true);
    setError(null);
    setDone(false);
    setCurrentStage("Starting…");

    try {
      const startRes = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", clearPrevious: true }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error ?? "Failed to start");

      const pipelineRunId = startData.pipeline_run_id as string;

      for (const stage of STAGES) {
        setCurrentStage(stage.label);
        const res = await fetch("/api/analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "stage",
            pipeline_run_id: pipelineRunId,
            stage: stage.id,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Stage ${stage.id} failed`);
      }

      setDone(true);
      setCurrentStage(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pipeline failed");
      setCurrentStage(null);
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
        <p className="text-sm text-muted-foreground">Stage: {currentStage}</p>
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
        Requires ANTHROPIC_API_KEY and VOYAGE_API_KEY in environment.
      </p>
    </div>
  );
}
