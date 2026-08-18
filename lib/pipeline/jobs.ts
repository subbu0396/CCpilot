import type { PipelineJob, PipelineStage, JobStatus } from "@/lib/supabase/types";
import { isLocalMode, readDb, writeDb, newId } from "@/lib/store/local-db";
import { createServiceClient } from "@/lib/supabase/client";
import type { TokenUsage } from "./claude";
import { estimateCostUsd } from "./claude";

export async function startJob(
  stage: PipelineStage,
  recordsTotal: number,
  companyFilter?: string | null
): Promise<PipelineJob> {
  const job: PipelineJob = {
    id: newId(),
    stage,
    status: "running",
    company_filter: companyFilter ?? null,
    records_processed: 0,
    records_total: recordsTotal,
    error_message: null,
    token_usage: {},
    estimated_cost_usd: null,
    metadata: {},
    started_at: new Date().toISOString(),
    completed_at: null,
    created_at: new Date().toISOString(),
  };

  if (isLocalMode()) {
    const db = readDb();
    db.pipeline_jobs.unshift(job);
    writeDb(db);
    return job;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("pipeline_jobs")
    .insert(job as never)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as PipelineJob;
}

export async function finishJob(
  jobId: string,
  opts: {
    status: JobStatus;
    records_processed: number;
    usage?: TokenUsage;
    error_message?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const token_usage = opts.usage ?? {};
  const estimated_cost_usd = opts.usage
    ? estimateCostUsd(opts.usage)
    : null;
  const patch = {
    status: opts.status,
    records_processed: opts.records_processed,
    error_message: opts.error_message ?? null,
    token_usage,
    estimated_cost_usd,
    metadata: opts.metadata ?? {},
    completed_at: new Date().toISOString(),
  };

  if (isLocalMode()) {
    const db = readDb();
    const idx = db.pipeline_jobs.findIndex((j) => j.id === jobId);
    if (idx >= 0) {
      db.pipeline_jobs[idx] = { ...db.pipeline_jobs[idx], ...patch };
      writeDb(db);
    }
    return;
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("pipeline_jobs")
    .update(patch as never)
    .eq("id", jobId);
  if (error) throw new Error(error.message);
}

export async function listJobs(): Promise<PipelineJob[]> {
  if (isLocalMode()) {
    return readDb().pipeline_jobs;
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("pipeline_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as PipelineJob[];
}
