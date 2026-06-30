import { createServerClient } from "./client";

export type PainPointRow = {
  id: string;
  feedback_item_id: string;
  summary: string;
  severity: number;
  sentiment: string;
  product_area: string;
  source: string;
  customer_id: string | null;
  timestamp: string;
};

export async function getPainPoints(filters?: {
  source?: string;
  severity?: number;
  product_area?: string;
  sentiment?: string;
}): Promise<PainPointRow[]> {
  const supabase = createServerClient();

  let query = supabase
    .from("pain_points")
    .select("*")
    .order("severity", { ascending: false });

  if (filters?.severity) query = query.gte("severity", filters.severity);
  if (filters?.product_area) query = query.eq("product_area", filters.product_area);
  if (filters?.sentiment) query = query.eq("sentiment", filters.sentiment);

  const { data: painData, error } = await query;
  if (error) throw error;
  if (!painData?.length) return [];

  const ids = painData.map((p) => p.feedback_item_id as string);
  const { data: feedbackData } = await supabase
    .from("feedback_items")
    .select("id, source, customer_id, timestamp")
    .in("id", ids);

  const feedbackMap = new Map(
    (feedbackData ?? []).map((f) => [f.id as string, f])
  );

  let rows = painData.map((row) => {
    const fi = feedbackMap.get(row.feedback_item_id as string);
    return {
      id: row.id as string,
      feedback_item_id: row.feedback_item_id as string,
      summary: row.summary as string,
      severity: row.severity as number,
      sentiment: row.sentiment as string,
      product_area: row.product_area as string,
      source: (fi?.source as string) ?? "unknown",
      customer_id: (fi?.customer_id as string | null) ?? null,
      timestamp: (fi?.timestamp as string) ?? "",
    };
  });

  if (filters?.source) {
    rows = rows.filter((r) => r.source === filters.source);
  }

  return rows;
}

export async function getSentimentDistribution() {
  const supabase = createServerClient();
  const { data, error } = await supabase.from("pain_points").select("sentiment");
  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const s = row.sentiment as string;
    counts[s] = (counts[s] ?? 0) + 1;
  }

  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

export async function getChurnByCustomer() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("churn_assessments")
    .select("customer_id, risk_level, justification, source_weight, feedback_item_id");

  if (error) throw error;

  const ids = (data ?? []).map((r) => r.feedback_item_id as string);
  const { data: feedbackData } = await supabase
    .from("feedback_items")
    .select("id, source")
    .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

  const sourceMap = new Map(
    (feedbackData ?? []).map((f) => [f.id as string, f.source as string])
  );

  const RISK_SCORE: Record<string, number> = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3,
  };

  const byCustomer = new Map<
    string,
    {
      customer_id: string;
      max_risk: string;
      score: number;
      signals: string[];
      sources: Set<string>;
    }
  >();

  for (const row of data ?? []) {
    const cid = (row.customer_id as string) ?? "Unknown";
    const risk = row.risk_level as string;
    const weight = Number(row.source_weight ?? 1);
    const score = RISK_SCORE[risk] * weight;
    const source = sourceMap.get(row.feedback_item_id as string);

    const existing = byCustomer.get(cid) ?? {
      customer_id: cid,
      max_risk: risk,
      score: 0,
      signals: [],
      sources: new Set<string>(),
    };

    existing.score += score;
    if (RISK_SCORE[risk] > RISK_SCORE[existing.max_risk]) {
      existing.max_risk = risk;
    }
    if (risk === "high" || risk === "medium") {
      existing.signals.push(row.justification as string);
    }
    if (source) existing.sources.add(source);

    byCustomer.set(cid, existing);
  }

  return Array.from(byCustomer.values())
    .sort((a, b) => b.score - a.score)
    .map((c) => ({
      ...c,
      sources: Array.from(c.sources),
      signals: c.signals.slice(0, 3),
    }));
}

export async function getChurnTrend() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("churn_assessments")
    .select("risk_level, feedback_item_id")
    .in("risk_level", ["medium", "high"]);

  if (error) throw error;

  const ids = (data ?? []).map((r) => r.feedback_item_id as string);
  const { data: feedbackData } = await supabase
    .from("feedback_items")
    .select("id, timestamp")
    .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

  const tsMap = new Map(
    (feedbackData ?? []).map((f) => [f.id as string, f.timestamp as string])
  );

  const byMonth: Record<string, number> = {};
  for (const row of data ?? []) {
    const ts = tsMap.get(row.feedback_item_id as string);
    if (!ts) continue;
    const month = ts.slice(0, 7);
    byMonth[month] = (byMonth[month] ?? 0) + 1;
  }

  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));
}

export async function getClusters() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("feedback_clusters")
    .select("*")
    .order("size", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getClusterDetail(id: string) {
  const supabase = createServerClient();
  const { data: cluster, error } = await supabase
    .from("feedback_clusters")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;

  const { data: members } = await supabase
    .from("cluster_members")
    .select("feedback_item_id")
    .eq("cluster_id", id);

  const memberIds = (members ?? []).map((m) => m.feedback_item_id as string);
  const { data: feedbackItems } = await supabase
    .from("feedback_items")
    .select("id, text, source, customer_id")
    .in("id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);

  return {
    cluster,
    members: (feedbackItems ?? []).map((m) => ({
      feedback_item_id: m.id as string,
      text: m.text as string,
      source: m.source as string,
      customer_id: m.customer_id as string | null,
    })),
  };
}

export async function getFeatures() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("feature_suggestions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const clusterIds = (data ?? [])
    .map((f) => f.cluster_id as string | null)
    .filter(Boolean) as string[];

  const { data: clusters } = await supabase
    .from("feedback_clusters")
    .select("id, label")
    .in("id", clusterIds.length ? clusterIds : ["00000000-0000-0000-0000-000000000000"]);

  const clusterMap = new Map(
    (clusters ?? []).map((c) => [c.id as string, c.label as string])
  );

  return (data ?? []).map((f) => ({
    ...f,
    feedback_clusters: f.cluster_id
      ? { label: clusterMap.get(f.cluster_id as string) ?? "—" }
      : null,
  }));
}

export async function getRoadmap() {
  const supabase = createServerClient();
  const { data: roadmap, error } = await supabase
    .from("roadmap_items")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;

  const featureIds = (roadmap ?? []).map((r) => r.feature_id as string);
  const { data: features } = await supabase
    .from("feature_suggestions")
    .select("*")
    .in("id", featureIds.length ? featureIds : ["00000000-0000-0000-0000-000000000000"]);

  const featureMap = new Map(
    (features ?? []).map((f) => [f.id as string, f])
  );

  return (roadmap ?? []).map((item) => ({
    ...item,
    feature_suggestions: featureMap.get(item.feature_id as string),
  }));
}

export async function getLatestPipelineRun() {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("analysis_pipeline_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}
