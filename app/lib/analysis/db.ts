import { createServerClient } from "@/lib/supabase/client";

export type FeedbackRow = {
  id: string;
  source: string;
  text: string;
  rating: number | null;
  timestamp: string;
  customer_id: string | null;
  metadata: Record<string, unknown>;
};

export async function fetchAllFeedback(): Promise<FeedbackRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("feedback_items")
    .select("id, source, text, rating, timestamp, customer_id, metadata")
    .order("timestamp", { ascending: false });

  if (error) throw error;
  return (data ?? []) as FeedbackRow[];
}

export async function createPipelineRun(): Promise<string> {
  const supabase = createServerClient();
  const id = crypto.randomUUID();
  const { error } = await supabase.from("analysis_pipeline_runs").insert({
    id,
    status: "running",
    current_stage: "pain_points",
    stages_done: [],
  });
  if (error) throw error;
  return id;
}

export async function updatePipelineRun(
  id: string,
  update: {
    status?: string;
    current_stage?: string;
    stages_done?: string[];
    error_message?: string;
    completed_at?: string;
  }
) {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("analysis_pipeline_runs")
    .update(update)
    .eq("id", id);
  if (error) throw error;
}

export async function createAnalysisJob(stage: string): Promise<string> {
  const supabase = createServerClient();
  const id = crypto.randomUUID();
  const { error } = await supabase.from("analysis_jobs").insert({
    id,
    stage,
    status: "running",
    started_at: new Date().toISOString(),
  });
  if (error) throw error;
  return id;
}

export async function completeAnalysisJob(
  id: string,
  result: Record<string, unknown>
) {
  const supabase = createServerClient();
  await supabase
    .from("analysis_jobs")
    .update({
      status: "completed",
      result,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function failAnalysisJob(id: string, message: string) {
  const supabase = createServerClient();
  await supabase
    .from("analysis_jobs")
    .update({
      status: "failed",
      error_message: message,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function clearAnalysisResults() {
  const supabase = createServerClient();
  await supabase.from("roadmap_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("feature_suggestions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("cluster_members").delete().neq("cluster_id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("feedback_clusters").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("feedback_embeddings").delete().neq("feedback_item_id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("churn_assessments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("pain_points").delete().neq("id", "00000000-0000-0000-0000-000000000000");
}
