"use client";

type RoadmapItem = {
  id: string;
  bucket: string;
  rationale: string;
  feature_suggestions?: {
    feature_name: string;
    description: string;
    impact_estimate: string;
    effort_size: string;
  };
};

type PainPoint = {
  summary: string;
  severity: number;
  product_area: string;
};

type ChurnCustomer = {
  customer_id: string;
  max_risk: string;
  signals: string[];
};

type AiRecommendationsProps = {
  roadmap: RoadmapItem[];
  painPoints: PainPoint[];
  churnCustomers: ChurnCustomer[];
  hasData: boolean;
  onViewRoadmap?: () => void;
};

const BUCKET_LABEL: Record<string, string> = {
  now: "Ship now",
  next: "Up next",
  later: "Later",
};

export function AiRecommendations({
  roadmap,
  painPoints,
  churnCustomers,
  hasData,
}: AiRecommendationsProps) {
  const nowItems = roadmap.filter((r) => r.bucket === "now").slice(0, 3);
  const topPain = painPoints
    .filter((p) => p.severity >= 4)
    .slice(0, 2);
  const highChurn = churnCustomers
    .filter((c) => c.max_risk === "high")
    .slice(0, 2);

  if (!hasData) {
    return (
      <section className="mb-4 rounded-xl border border-dashed bg-muted/20 px-4 py-3">
        <h2 className="text-sm font-semibold">AI Recommendations</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Import reviews and run analysis to get prioritized actions.
        </p>
      </section>
    );
  }

  const hasRecs =
    nowItems.length > 0 || topPain.length > 0 || highChurn.length > 0;

  if (!hasRecs) {
    return (
      <section className="mb-4 rounded-xl border bg-gradient-to-r from-violet-50 to-blue-50 px-4 py-3">
        <h2 className="text-sm font-semibold">AI Recommendations</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Run the analysis pipeline to generate roadmap and churn recommendations.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-4 rounded-xl border bg-gradient-to-r from-violet-50/90 to-blue-50/90 px-4 py-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
          AI
        </span>
        <h2 className="text-sm font-semibold">AI Recommendations</h2>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {nowItems.map((item) => {
          const feat = item.feature_suggestions;
          if (!feat) return null;
          return (
            <div
              key={item.id}
              className="min-w-[200px] max-w-[240px] shrink-0 rounded-lg border border-emerald-200 bg-white/90 p-2.5"
            >
              <span className="text-[9px] font-semibold uppercase tracking-wide text-emerald-700">
                {BUCKET_LABEL.now}
              </span>
              <p className="mt-1 text-xs font-medium leading-snug">
                {feat.feature_name}
              </p>
              <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
                {item.rationale}
              </p>
            </div>
          );
        })}

        {topPain.map((p, i) => (
          <div
            key={`pain-${i}`}
            className="min-w-[200px] max-w-[240px] shrink-0 rounded-lg border border-amber-200 bg-white/90 p-2.5"
          >
            <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-700">
              Top pain · {p.product_area}
            </span>
            <p className="mt-1 text-xs font-medium leading-snug">{p.summary}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Severity {p.severity}/5
            </p>
          </div>
        ))}

        {highChurn.map((c) => (
          <div
            key={c.customer_id}
            className="min-w-[200px] max-w-[240px] shrink-0 rounded-lg border border-red-200 bg-white/90 p-2.5"
          >
            <span className="text-[9px] font-semibold uppercase tracking-wide text-red-700">
              Churn risk
            </span>
            <p className="mt-1 text-xs font-medium">{c.customer_id}</p>
            <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
              {c.signals[0] ?? "Elevated risk across feedback sources"}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
