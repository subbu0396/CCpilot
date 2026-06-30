"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const STAGES = [
  { id: "pain_points", label: "Pain points", batchSize: 3 },
  { id: "churn_risk", label: "Churn risk", batchSize: 3 },
  { id: "embeddings", label: "Embeddings", batchSize: 3 },
  { id: "clustering", label: "Clustering", batchSize: 1 },
  { id: "features", label: "Features", batchSize: 1 },
  { id: "roadmap", label: "Roadmap", batchSize: 1 },
] as const;

const MAX_RETRIES = 3;

async function parseApiResponse(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (text.includes("An error occurred") || text.includes("FUNCTION_INVOCATION")) {
      throw new Error(
        "Request timed out on Vercel. Retrying… If it persists, set ANALYSIS_MAX_ITEMS lower in Vercel env."
      );
    }
    throw new Error(text.slice(0, 200) || `Server error (${res.status})`);
  }
}

async function postAnalysis(body: Record<string, unknown>) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch("/api/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await parseApiResponse(res);
    if (res.ok) return data;

    lastError = new Error(String(data.error ?? `Request failed (${res.status})`));
    const retryable =
      res.status >= 500 || res.status === 429 || res.status === 408;
    if (!retryable || attempt === MAX_RETRIES - 1) throw lastError;

    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }

  throw lastError ?? new Error("Request failed");
}

export function RunPipelineButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [itemNote, setItemNote] = useState<string | null>(null);

  async function runStage(
    pipelineRunId: string,
    stageId: string,
    stageLabel: string,
    itemCount: number,
    batchSize: number,
    batchDelayMs = 0
  ) {
    let offset = 0;
    let hasMore = true;
    const totalBatches = Math.max(1, Math.ceil(itemCount / batchSize));
    let batchNum = 0;

    while (hasMore) {
      batchNum += 1;
      setProgress(`${stageLabel} · batch ${batchNum}/${totalBatches}`);

      const data = await postAnalysis({
        action: "stage",
        pipeline_run_id: pipelineRunId,
        stage: stageId,
        offset,
      });

      hasMore = Boolean(data.has_more);
      offset = Number(data.next_offset ?? 0);

      if (hasMore && batchDelayMs > 0) {
        setProgress(
          `${stageLabel} · batch ${batchNum}/${totalBatches} · waiting for Voyage rate limit…`
        );
        await new Promise((r) => setTimeout(r, batchDelayMs));
      }
    }
  }

  async function handleRun() {
    setRunning(true);
    setError(null);
    setDone(false);
    setProgress(null);
    setItemNote(null);
    setCurrentStage("Starting…");

    try {
      const startData = await postAnalysis({
        action: "start",
        clearPrevious: true,
      });

      const pipelineRunId = startData.pipeline_run_id as string;
      const itemCount = Number(startData.item_count ?? 0);
      const totalFeedback = Number(startData.total_feedback_count ?? itemCount);
      const maxItems = Number(startData.max_items ?? itemCount);
      const voyageDelay = Number(startData.voyage_batch_delay_ms ?? 22_000);

      if (totalFeedback > itemCount) {
        setItemNote(
          `Analyzing ${itemCount} most recent items (${totalFeedback} total in database). Set ANALYSIS_MAX_ITEMS in Vercel to analyze more.`
        );
      } else {
        setItemNote(`Analyzing ${itemCount} feedback items.`);
      }

      for (const stage of STAGES) {
        setCurrentStage(stage.label);
        await runStage(
          pipelineRunId,
          stage.id,
          stage.label,
          stage.id === "clustering" || stage.id === "features"
            ? Math.min(itemCount, maxItems)
            : itemCount,
          stage.batchSize,
          stage.id === "embeddings" ? voyageDelay : 0
        );
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

      {itemNote && (
        <p className="text-xs text-muted-foreground">{itemNote}</p>
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
        Requires ANTHROPIC_API_KEY and VOYAGE_API_KEY in Vercel. Default cap: 100 items
        (ANALYSIS_MAX_ITEMS). Run migration{" "}
        <code>003_pipeline_payload.sql</code> in Supabase if clustering fails.
      </p>
    </div>
  );
}
