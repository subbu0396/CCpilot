import { isLocalMode, readDb } from "@/lib/store/local-db";
import { createServiceClient } from "@/lib/supabase/client";
import type {
  FeedbackItem,
  PainPoint,
  ChurnSignal,
  Cluster,
  Feature,
  RoadmapItem,
  PipelineJob,
  AISuggestion,
  CoreAnalysis,
} from "@/lib/supabase/types";

export interface DashboardBundle {
  feedback: FeedbackItem[];
  painPoints: PainPoint[];
  churnSignals: ChurnSignal[];
  coreAnalysis: CoreAnalysis[];
  clusters: Cluster[];
  feedbackClusters: {
    feedback_item_id: string;
    cluster_id: string;
    run_id: string;
  }[];
  features: Feature[];
  roadmap: RoadmapItem[];
  jobs: PipelineJob[];
  suggestionsCache: {
    filter_key: string;
    suggestions: AISuggestion[];
  }[];
  mode: "local" | "supabase";
}

export async function loadDashboardBundle(): Promise<DashboardBundle> {
  if (isLocalMode()) {
    const db = readDb();
    const latestRun = db.clusters[0]?.run_id;
    const clusters = latestRun
      ? db.clusters.filter((c) => c.run_id === latestRun)
      : [];
    const clusterIds = new Set(clusters.map((c) => c.id));
    const feedbackClusters = latestRun
      ? db.feedback_clusters.filter((m) => m.run_id === latestRun)
      : [];
    const features = db.features.filter((f) => clusterIds.has(f.cluster_id));
    const latestRoadmapRun = db.roadmap[0]?.run_id;
    const roadmap = latestRoadmapRun
      ? db.roadmap.filter((r) => r.run_id === latestRoadmapRun)
      : [];

    return {
      feedback: db.feedback_items,
      painPoints: db.pain_points,
      churnSignals: db.churn_signals,
      coreAnalysis: db.core_analysis,
      clusters,
      feedbackClusters,
      features,
      roadmap,
      jobs: db.pipeline_jobs,
      suggestionsCache: db.ai_suggestions_cache.map((c) => ({
        filter_key: c.filter_key,
        suggestions: c.suggestions,
      })),
      mode: "local",
    };
  }

  const supabase = createServiceClient();
  const [
    feedback,
    painPoints,
    churnSignals,
    coreAnalysis,
    clustersRes,
    features,
    roadmap,
    jobs,
    cache,
  ] = await Promise.all([
    supabase.from("feedback_items").select("*"),
    supabase.from("pain_points").select("*"),
    supabase.from("churn_signals").select("*"),
    supabase.from("core_analysis").select("*").order("created_at", { ascending: false }),
    supabase.from("clusters").select("*").order("created_at", { ascending: false }),
    supabase.from("features").select("*"),
    supabase.from("roadmap").select("*").order("created_at", { ascending: false }),
    supabase.from("pipeline_jobs").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("ai_suggestions_cache").select("*"),
  ]);

  const allClusters = (clustersRes.data ?? []) as Cluster[];
  const latestRun = allClusters[0]?.run_id;
  const clusters = latestRun
    ? allClusters.filter((c) => c.run_id === latestRun)
    : [];

  let feedbackClusters: DashboardBundle["feedbackClusters"] = [];
  if (latestRun) {
    const { data } = await supabase
      .from("feedback_clusters")
      .select("*")
      .eq("run_id", latestRun);
    feedbackClusters = (data ?? []) as DashboardBundle["feedbackClusters"];
  }

  const allRoadmap = (roadmap.data ?? []) as RoadmapItem[];
  const latestRoadmapRun = allRoadmap[0]?.run_id;
  const roadmapRows = latestRoadmapRun
    ? allRoadmap.filter((r) => r.run_id === latestRoadmapRun)
    : [];

  return {
    feedback: (feedback.data ?? []) as FeedbackItem[],
    painPoints: (painPoints.data ?? []) as PainPoint[],
    churnSignals: (churnSignals.data ?? []) as ChurnSignal[],
    coreAnalysis: (coreAnalysis.data ?? []) as CoreAnalysis[],
    clusters,
    feedbackClusters,
    features: (features.data ?? []) as Feature[],
    roadmap: roadmapRows,
    jobs: (jobs.data ?? []) as PipelineJob[],
    suggestionsCache: ((cache.data ?? []) as { filter_key: string; suggestions: AISuggestion[] }[]),
    mode: "supabase",
  };
}
