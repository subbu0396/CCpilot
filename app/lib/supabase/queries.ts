import { createServerClient } from "./client";

export type IngestionSummary = {
  source: string;
  count: number;
  last_import: string | null;
};

export async function getIngestionSummary(): Promise<IngestionSummary[]> {
  const supabase = createServerClient();
  const sources = ["ticket", "playstore", "call", "review"] as const;

  const results: IngestionSummary[] = [];

  for (const source of sources) {
    const { count } = await supabase
      .from("feedback_items")
      .select("*", { count: "exact", head: true })
      .eq("source", source);

    const { data: lastRun } = await supabase
      .from("ingestion_runs")
      .select("completed_at")
      .eq("source", source)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    results.push({
      source,
      count: count ?? 0,
      last_import: lastRun?.completed_at ?? null,
    });
  }

  return results;
}

export async function getIngestionRuns() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("ingestion_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return data;
}

export async function getFeedbackItems(source?: string, limit = 20) {
  const supabase = createServerClient();
  let query = supabase
    .from("feedback_items")
    .select("*")
    .order("timestamp", { ascending: false })
    .limit(limit);

  if (source) query = query.eq("source", source);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}
