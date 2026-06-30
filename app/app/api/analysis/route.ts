import {
  failPipeline,
  runAnalysisPipeline,
  runPipelineStage,
  startPipeline,
  ANALYSIS_STAGES,
} from "@/lib/analysis/pipeline";
import { AnalysisStage } from "@/lib/analysis/schemas";
import { createServerClient } from "@/lib/supabase/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  let pipelineRunId: string | undefined;

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action as string | undefined;
    pipelineRunId = body.pipeline_run_id as string | undefined;

    if (action === "start") {
      const result = await startPipeline(body.clearPrevious !== false);
      return NextResponse.json(result);
    }

    if (action === "stage") {
      const stage = body.stage as AnalysisStage;

      if (!pipelineRunId || !stage) {
        return NextResponse.json(
          { error: "pipeline_run_id and stage required" },
          { status: 400 }
        );
      }

      if (!ANALYSIS_STAGES.includes(stage)) {
        return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
      }

      const result = await runPipelineStage(pipelineRunId, stage);
      return NextResponse.json({ stage, ...result });
    }

    const result = await runAnalysisPipeline({
      clearPrevious: body.clearPrevious !== false,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    if (pipelineRunId) {
      await failPipeline(pipelineRunId, message).catch(() => {});
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const supabase = createServerClient();
  const { data: latestRun } = await supabase
    .from("analysis_pipeline_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: recentJobs } = await supabase
    .from("analysis_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  const { count: painCount } = await supabase
    .from("pain_points")
    .select("*", { count: "exact", head: true });

  return NextResponse.json({
    latest_run: latestRun,
    recent_jobs: recentJobs,
    pain_points_count: painCount ?? 0,
  });
}
