"use client";

import { useMemo, useState } from "react";
import { ChurnTrendChart } from "@/components/ChurnTrendChart";
import { ImpactEffortScatter } from "@/components/ImpactEffortScatter";
import { SentimentChart } from "@/components/SentimentChart";
import type {
  ClusterEnriched,
  PainPointWithQuote,
} from "@/lib/supabase/analysis-queries";

type ChurnCustomer = {
  customer_id: string;
  max_risk: string;
  score: number;
  signals: string[];
  sources: string[];
};

type FeatureRow = {
  id: string;
  feature_name: string;
  description: string;
  impact_estimate: string;
  effort_size: string;
  feedback_clusters: { label: string } | null;
};

type RoadmapRow = {
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

type IngestionSummary = {
  source: string;
  count: number;
  last_import: string | null;
};

export type DashboardProps = {
  stats: {
    totalFeedback: number;
    painPointCount: number;
    clusterCount: number;
    highChurnCount: number;
    roadmapCount: number;
  };
  summary: IngestionSummary[];
  pipelineStatus: string | null;
  sentiment: { name: string; value: number }[];
  churnTrend: { month: string; count: number }[];
  painPoints: PainPointWithQuote[];
  clusters: ClusterEnriched[];
  churnCustomers: ChurnCustomer[];
  features: FeatureRow[];
  roadmap: RoadmapRow[];
};

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "themes", label: "Common themes" },
  { id: "pain", label: "Pain points" },
  { id: "churn", label: "Churn signals" },
  { id: "roadmap", label: "Roadmap" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const BUCKETS = [
  { id: "now", label: "Now", color: "border-emerald-300 bg-emerald-50/80" },
  { id: "next", label: "Next", color: "border-blue-300 bg-blue-50/80" },
  { id: "later", label: "Later", color: "border-slate-300 bg-slate-50/80" },
] as const;

function severityColor(severity: number) {
  if (severity >= 4) return "bg-red-100 text-red-800 border-red-200";
  if (severity >= 3) return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function riskColor(risk: string) {
  if (risk === "high") return "bg-red-100 text-red-800";
  if (risk === "medium") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-600";
}

export function IntelligenceDashboard({
  stats,
  summary,
  pipelineStatus,
  sentiment,
  churnTrend,
  painPoints,
  clusters,
  churnCustomers,
  features,
  roadmap,
}: DashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [expandedCluster, setExpandedCluster] = useState<string | null>(
    clusters[0]?.id ?? null
  );
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);

  const productAreas = useMemo(
    () => Array.from(new Set(painPoints.map((p) => p.product_area))).sort(),
    [painPoints]
  );

  const filteredPainPoints = useMemo(() => {
    let rows = painPoints;
    if (selectedArea) rows = rows.filter((p) => p.product_area === selectedArea);
    if (selectedTheme) {
      const cluster = clusters.find((c) => c.id === selectedTheme);
      if (cluster) {
        const quotes = new Set(
          cluster.member_quotes.map((q) => q.text.slice(0, 80))
        );
        rows = rows.filter(
          (p) =>
            quotes.has(p.quote.slice(0, 80)) ||
            cluster.label
              .toLowerCase()
              .includes(p.product_area.toLowerCase()) ||
            p.summary.toLowerCase().includes(cluster.label.toLowerCase().slice(0, 8))
        );
        if (rows.length === 0) rows = painPoints.slice(0, 5);
      }
    }
    return rows;
  }, [painPoints, selectedArea, selectedTheme, clusters]);

  const highRiskCustomers = churnCustomers.filter(
    (c) => c.max_risk === "high" || c.max_risk === "medium"
  );

  const hasData = stats.totalFeedback > 0;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: "Reviews", value: stats.totalFeedback },
          { label: "Pain points", value: stats.painPointCount },
          { label: "Themes", value: stats.clusterCount },
          { label: "High churn", value: stats.highChurnCount },
          { label: "Roadmap items", value: stats.roadmapCount },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-lg border bg-card px-3 py-2.5 shadow-sm"
          >
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {s.label}
            </p>
            <p className="mt-0.5 text-xl font-bold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      {pipelineStatus && (
        <p className="text-xs text-muted-foreground">
          Analysis: <span className="font-medium capitalize">{pipelineStatus}</span>
        </p>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b pb-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {!hasData && (
          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            Import reviews on the left, then run analysis to populate insights.
          </div>
        )}

        {hasData && activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-lg border bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold">Sentiment mix</h3>
                <SentimentChart data={sentiment} />
              </section>
              <section className="rounded-lg border bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold">Churn signal trend</h3>
                <ChurnTrendChart data={churnTrend} />
              </section>
            </div>

            <section className="rounded-lg border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold">Impact vs effort</h3>
              <ImpactEffortScatter features={features} />
            </section>

            <div className="grid gap-4 sm:grid-cols-4">
              {(["ticket", "playstore", "call", "review"] as const).map((src) => {
                const row = summary.find((s) => s.source === src);
                return (
                  <div key={src} className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-xs capitalize text-muted-foreground">{src}</p>
                    <p className="text-lg font-bold">{row?.count ?? 0}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {hasData && activeTab === "themes" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Click a theme to explore customer quotes and linked pain points.
            </p>
            {clusters.length === 0 ? (
              <p className="text-sm text-muted-foreground">No themes yet. Run analysis.</p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {clusters.map((cluster) => {
                  const expanded = expandedCluster === cluster.id;
                  return (
                    <div
                      key={cluster.id}
                      className={`rounded-lg border bg-card transition ${
                        expanded ? "border-primary shadow-md ring-1 ring-primary/20" : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedCluster(expanded ? null : cluster.id);
                          setSelectedTheme(expanded ? null : cluster.id);
                          if (!expanded) setActiveTab("pain");
                        }}
                        className="w-full p-4 text-left"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold">{cluster.label}</h3>
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs">
                            {cluster.size} reviews
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                          {cluster.summary}
                        </p>
                        {cluster.avg_severity != null && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Avg severity {Number(cluster.avg_severity).toFixed(1)} / 5
                          </p>
                        )}
                      </button>

                      {expanded && (
                        <div className="border-t px-4 pb-4 pt-3 space-y-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Customer quotes
                          </p>
                          {(cluster.member_quotes.length
                            ? cluster.member_quotes
                            : cluster.sample_quotes.map((t) => ({
                                text: t,
                                source: "—",
                                customer_id: null,
                              }))
                          ).map((q, i) => (
                            <blockquote
                              key={i}
                              className="rounded-md border-l-4 border-primary/40 bg-muted/40 px-3 py-2 text-sm italic"
                            >
                              &ldquo;{q.text.slice(0, 280)}
                              {q.text.length > 280 ? "…" : ""}&rdquo;
                              <footer className="mt-1 text-[10px] not-italic text-muted-foreground">
                                {typeof q === "object" && "source" in q && (
                                  <>
                                    {q.source}
                                    {q.customer_id ? ` · ${q.customer_id}` : ""}
                                  </>
                                )}
                              </footer>
                            </blockquote>
                          ))}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTheme(cluster.id);
                              setActiveTab("pain");
                            }}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            View related pain points →
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {hasData && activeTab === "pain" && (
          <div className="space-y-4">
            {selectedTheme && (
              <p className="rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">
                Filtered by theme:{" "}
                <strong>{clusters.find((c) => c.id === selectedTheme)?.label}</strong>
                <button
                  type="button"
                  onClick={() => setSelectedTheme(null)}
                  className="ml-2 underline"
                >
                  Clear
                </button>
              </p>
            )}

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedArea(null)}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  !selectedArea ? "bg-primary text-primary-foreground" : "border"
                }`}
              >
                All areas
              </button>
              {productAreas.map((area) => (
                <button
                  key={area}
                  type="button"
                  onClick={() => setSelectedArea(area)}
                  className={`rounded-full px-2.5 py-1 text-xs ${
                    selectedArea === area
                      ? "bg-primary text-primary-foreground"
                      : "border hover:bg-muted"
                  }`}
                >
                  {area}
                </button>
              ))}
            </div>

            {filteredPainPoints.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pain points yet.</p>
            ) : (
              <div className="space-y-3">
                {filteredPainPoints.map((pp) => (
                  <article
                    key={pp.id}
                    className="rounded-lg border bg-card p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded border px-2 py-0.5 text-xs font-semibold ${severityColor(pp.severity)}`}
                      >
                        Severity {pp.severity}
                      </span>
                      <span className="text-xs capitalize text-muted-foreground">
                        {pp.sentiment} · {pp.product_area} · {pp.source}
                      </span>
                    </div>
                    <p className="mt-2 font-medium">{pp.summary}</p>
                    {pp.quote && (
                      <blockquote className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                        &ldquo;{pp.quote.slice(0, 300)}
                        {pp.quote.length > 300 ? "…" : ""}&rdquo;
                      </blockquote>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {hasData && activeTab === "churn" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Customers flagged by weighted risk across tickets, calls, and reviews.
            </p>
            {highRiskCustomers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No churn signals yet.</p>
            ) : (
              <div className="space-y-3">
                {highRiskCustomers.slice(0, 12).map((c) => (
                  <div
                    key={c.customer_id}
                    className="rounded-lg border bg-card p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{c.customer_id}</span>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${riskColor(c.max_risk)}`}
                      >
                        {c.max_risk} risk
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Score {c.score.toFixed(1)} · {c.sources.join(", ")}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {c.signals.map((s, i) => (
                        <li
                          key={i}
                          className="flex gap-2 text-sm text-muted-foreground"
                        >
                          <span className="text-destructive">⚠</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {hasData && activeTab === "roadmap" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                AI-recommended priorities from clusters and pain points.
              </p>
              <div className="flex gap-2">
                <a
                  href="/api/roadmap/export?format=csv"
                  className="rounded border px-2 py-1 text-xs hover:bg-muted"
                >
                  Export CSV
                </a>
                <a
                  href="/api/roadmap/export?format=md"
                  className="rounded border px-2 py-1 text-xs hover:bg-muted"
                >
                  Export MD
                </a>
              </div>
            </div>

            {roadmap.length === 0 ? (
              <p className="text-sm text-muted-foreground">No roadmap yet.</p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-3">
                {BUCKETS.map((bucket) => {
                  const items = roadmap.filter((i) => i.bucket === bucket.id);
                  return (
                    <div
                      key={bucket.id}
                      className={`rounded-lg border-2 p-3 ${bucket.color}`}
                    >
                      <h3 className="mb-3 font-semibold">{bucket.label}</h3>
                      <ul className="space-y-2">
                        {items.length === 0 ? (
                          <li className="text-xs text-muted-foreground">—</li>
                        ) : (
                          items.map((item) => {
                            const feat = item.feature_suggestions;
                            if (!feat) return null;
                            return (
                              <li
                                key={item.id}
                                className="rounded-md border bg-white p-3 text-sm shadow-sm"
                              >
                                <p className="font-medium">{feat.feature_name}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {feat.description}
                                </p>
                                <p className="mt-2 text-[10px]">
                                  Impact {feat.impact_estimate} · Effort{" "}
                                  {feat.effort_size}
                                </p>
                                <p className="mt-2 text-xs italic text-muted-foreground">
                                  {item.rationale}
                                </p>
                              </li>
                            );
                          })
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
