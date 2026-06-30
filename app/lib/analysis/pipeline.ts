import {
  clearAnalysisResults,
  createPipelineRun,
  fetchAllFeedback,
  updatePipelineRun,
} from "./db";
import { runPainPointBatch } from "./stages/pain-points";
import { runChurnBatch } from "./stages/churn-risk";
import { runEmbeddingsBatch } from "./stages/embeddings";
import { runClusteringBatch } from "./stages/clustering";
import { runFeatureBatch } from "./stages/features";
import { runRoadmapGeneration } from "./stages/roadmap";
import { ANALYSIS_STAGES, type AnalysisStage } from "./schemas";

export type StageBatchResult = {
  processed: number;
  has_more: boolean;
  next_offset: number;
  duration_ms: number;
};

export async function startPipeline(clearPrevious = true): Promise<{
  pipeline_run_id: string;
  item_count: number;
  stages: AnalysisStage[];
}> {
  const items = await fetchAllFeedback();
  if (items.length === 0) {
    throw new Error("No feedback items to analyze. Import data first.");
  }

  if (clearPrevious) {
    await clearAnalysisResults();
  }

  const pipelineRunId = await createPipelineRun();
  return {
    pipeline_run_id: pipelineRunId,
    item_count: items.length,
    stages: [...ANALYSIS_STAGES],
  };
}

export async function runPipelineStageBatch(
  pipelineRunId: string,
  stage: AnalysisStage,
  offset: number
): Promise<StageBatchResult> {
  const items = await fetchAllFeedback();
  const start = Date.now();

  let batch: { processed: number; has_more: boolean; next_offset: number };

  switch (stage) {
    case "pain_points":
      batch = await runPainPointBatch(items, offset);
      break;
    case "churn_risk":
      batch = await runChurnBatch(items, offset);
      break;
    case "embeddings":
      batch = await runEmbeddingsBatch(items, offset);
      break;
    case "clustering":
      batch = await runClusteringBatch(items, pipelineRunId, offset);
      break;
    case "features":
      batch = await runFeatureBatch(pipelineRunId, offset);
      break;
    case "roadmap":
      batch = {
        processed: await runRoadmapGeneration(pipelineRunId),
        has_more: false,
        next_offset: 0,
      };
      break;
    default:
      throw new Error(`Unknown stage: ${stage}`);
  }

  const duration_ms = Date.now() - start;

  if (!batch.has_more) {
    const supabase = await import("@/lib/supabase/client").then((m) =>
      m.createServerClient()
    );
    const { data: run } = await supabase
      .from("analysis_pipeline_runs")
      .select("stages_done")
      .eq("id", pipelineRunId)
      .single();

    const stagesDone = [...((run?.stages_done as string[]) ?? []), stage];

    await updatePipelineRun(pipelineRunId, {
      current_stage: stage,
      stages_done: stagesDone,
      ...(stage === "roadmap"
        ? {
            status: "completed",
            completed_at: new Date().toISOString(),
          }
        : {}),
    });
  } else {
    await updatePipelineRun(pipelineRunId, {
      current_stage: stage,
    });
  }

  return { ...batch, duration_ms };
}

export async function failPipeline(pipelineRunId: string, message: string) {
  await updatePipelineRun(pipelineRunId, {
    status: "failed",
    error_message: message,
    completed_at: new Date().toISOString(),
  });
}

export { ANALYSIS_STAGES };
