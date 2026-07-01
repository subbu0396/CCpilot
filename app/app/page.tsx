export const dynamic = "force-dynamic";

import { Workspace } from "@/components/Workspace";
import {
  getChurnByCustomer,
  getChurnTrend,
  getDashboardStats,
  getFeatures,
  getLatestPipelineRun,
  getPainPointsWithQuotes,
  getReviewWordCloud,
  getRoadmap,
  getSentimentDistribution,
} from "@/lib/supabase/analysis-queries";
import { getIngestionSummary } from "@/lib/supabase/queries";

export default async function HomePage() {
  let error: string | null = null;

  const defaults = {
    stats: {
      totalFeedback: 0,
      painPointCount: 0,
      clusterCount: 0,
      highChurnCount: 0,
      roadmapCount: 0,
    },
    summary: [] as Awaited<ReturnType<typeof getIngestionSummary>>,
    pipelineStatus: null as string | null,
    pipelineError: null as string | null,
    sentiment: [] as Awaited<ReturnType<typeof getSentimentDistribution>>,
    churnTrend: [] as Awaited<ReturnType<typeof getChurnTrend>>,
    painPoints: [] as Awaited<ReturnType<typeof getPainPointsWithQuotes>>,
    reviewWords: [] as Awaited<ReturnType<typeof getReviewWordCloud>>,
    churnCustomers: [] as Awaited<ReturnType<typeof getChurnByCustomer>>,
    features: [] as Awaited<ReturnType<typeof getFeatures>>,
    roadmap: [] as Awaited<ReturnType<typeof getRoadmap>>,
  };

  try {
    const [
      stats,
      summary,
      pipelineRun,
      sentiment,
      churnTrend,
      painPoints,
      reviewWords,
      churnCustomers,
      features,
      roadmap,
    ] = await Promise.all([
      getDashboardStats(),
      getIngestionSummary(),
      getLatestPipelineRun(),
      getSentimentDistribution(),
      getChurnTrend(),
      getPainPointsWithQuotes(20),
      getReviewWordCloud(35),
      getChurnByCustomer(),
      getFeatures(),
      getRoadmap(),
    ]);

    return (
      <Workspace
        stats={stats}
        summary={summary}
        pipelineStatus={pipelineRun?.status ?? null}
        pipelineError={
          pipelineRun?.status === "failed"
            ? (pipelineRun.error_message as string | null)
            : null
        }
        sentiment={sentiment}
        churnTrend={churnTrend}
        painPoints={painPoints}
        reviewWords={reviewWords}
        churnCustomers={churnCustomers}
        features={features.map((f) => ({
          id: f.id as string,
          feature_name: f.feature_name as string,
          description: f.description as string,
          impact_estimate: f.impact_estimate as string,
          effort_size: f.effort_size as string,
          feedback_clusters: f.feedback_clusters,
        }))}
        roadmap={roadmap.map((r) => ({
          id: r.id as string,
          bucket: r.bucket as string,
          rationale: r.rationale as string,
          feature_suggestions: r.feature_suggestions as
            | {
                feature_name: string;
                description: string;
                impact_estimate: string;
                effort_size: string;
              }
            | undefined,
        }))}
      />
    );
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load dashboard";
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
        <Workspace {...defaults} pipelineError={error} />
      </div>
    );
  }
}
