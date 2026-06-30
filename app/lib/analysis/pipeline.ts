import {
  clearAnalysisResults,
  createAnalysisJob,
  createPipelineRun,
  completeAnalysisJob,
  failAnalysisJob,
  fetchAllFeedback,
  updatePipelineRun,
} from "./db";
import { runPainPointExtraction } from "./stages/pain-points";
import { runChurnScoring } from "./stages/churn-risk";
import { runEmbeddings } from "./stages/embeddings";
import { runClustering } from "./stages/clustering";
import { runFeatureExtraction } from "./stages/features";
import { runRoadmapGeneration } from "./stages/roadmap";
import { ANALYSIS_STAGES, type AnalysisStage } from "./schemas";

export type PipelineResult = {
  pipeline_run_id: string;
  stages: Record<string, { processed: number; duration_ms: number }>;
};

async function runStageJob<T>(
  stage: AnalysisStage,
  fn: () => Promise<T>
): Promise<T> {
  const jobId = await createAnalysisJob(stage);
  try {
    const result = await fn();
    await completeAnalysisJob(jobId, {
      processed: typeof result === "number" ? result : 0,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failAnalysisJob(jobId, message);
    throw err;
  }
}

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

export async function runPipelineStage(
  pipelineRunId: string,
  stage: AnalysisStage
): Promise<{ processed: number; duration_ms: number }> {
  const items = await fetchAllFeedback();
  const start = Date.now();

  const processed = await runStageJob(stage, async () => {
    switch (stage) {
      case "pain_points":
        return runPainPointExtraction(items);
      case "churn_risk":
        return runChurnScoring(items);
      case "embeddings":
        return runEmbeddings(items);
      case "clustering":
        return runClustering(items, pipelineRunId);
      case "features":
        return runFeatureExtraction(pipelineRunId);
      case "roadmap":
        return runRoadmapGeneration(pipelineRunId);
      default:
        throw new Error(`Unknown stage: ${stage}`);
    }
  });

  const duration_ms = Date.now() - start;

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

  return { processed, duration_ms };
}

export async function failPipeline(pipelineRunId: string, message: string) {
  await updatePipelineRun(pipelineRunId, {
    status: "failed",
    error_message: message,
    completed_at: new Date().toISOString(),
  });
}

export async function runAnalysisPipeline(options?: {
  clearPrevious?: boolean;
}): Promise<PipelineResult> {
  const { pipeline_run_id, stages } = await startPipeline(
    options?.clearPrevious ?? true
  );
  const stageResults: Record<string, { processed: number; duration_ms: number }> =
    {};

  try {
    for (const stage of stages) {
      stageResults[stage] = await runPipelineStage(pipeline_run_id, stage);
    }
    return { pipeline_run_id, stages: stageResults };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failPipeline(pipeline_run_id, message);
    throw err;
  }
}

export { ANALYSIS_STAGES };
