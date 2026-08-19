"use client";

import { AISuggestions } from "@/components/dashboard/AISuggestions";
import { PainPoints } from "@/components/dashboard/PainPoints";
import { ChurnRisk } from "@/components/dashboard/ChurnRisk";
import { LiveAnalysis } from "@/components/dashboard/LiveAnalysis";
import { Clusters } from "@/components/dashboard/Clusters";
import { Features } from "@/components/dashboard/Features";
import { Roadmap } from "@/components/dashboard/Roadmap";
import { Admin } from "@/components/dashboard/Admin";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { useView } from "@/components/dashboard/ViewProvider";
import { MobileViewSelect } from "@/components/dashboard/MobileViewSelect";
import { Skeleton } from "@/components/ui/skeleton";

const SECTIONS = {
  suggestions: AISuggestions,
  "pain-points": PainPoints,
  churn: ChurnRisk,
  "live-analysis": LiveAnalysis,
  clusters: Clusters,
  features: Features,
  roadmap: Roadmap,
  admin: Admin,
} as const;

const VIEW_HEADLINES: Record<keyof typeof SECTIONS, string> = {
  suggestions:
    "AI-ranked actions across pain points, churn, and roadmap — prioritized for the current filters.",
  "pain-points":
    "Severity, sentiment, and product area extracted from every piece of filtered feedback.",
  churn:
    "Weighted churn-risk signals — which customers are showing signs of leaving, and why.",
  "live-analysis":
    "Real-time sentiment, churn, and category analysis on every Zendesk ticket and comment as it arrives.",
  clusters:
    "Feedback grouped into themes by embedding similarity, across companies and sources.",
  features:
    "Proposed features scored by impact vs. effort, generated from the clustered themes.",
  roadmap:
    "Now / Next / Later prioritization by impact-to-effort ratio — drag to override.",
  admin:
    "Pipeline status, re-run controls, and ingest health for the underlying data.",
};

export default function HomePage() {
  const { loading, error, data } = useDashboard();
  const { view } = useView();
  const ActiveSection = SECTIONS[view];

  if (loading && !data) {
    return (
      <div className="space-y-6 px-4 py-8 lg:px-8">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="px-4 py-16 text-center lg:px-8">
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-slate-900">
          Unable to load dashboard
        </h1>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
        <p className="mt-4 text-xs text-slate-500">
          Run <code className="rounded bg-slate-200 px-1">npm run load:sample</code> then{" "}
          <code className="rounded bg-slate-200 px-1">npm run pipeline:run</code>
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,_rgba(47,111,106,0.12),_transparent_60%)]"
      />
      <MobileViewSelect />
      <div className="relative mx-auto max-w-7xl space-y-8 px-4 py-8 lg:px-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2f6f6a]">
            Customer Intelligence Copilot
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl tracking-tight text-slate-900 md:text-5xl">
            CCPilot
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 md:text-base">
            {VIEW_HEADLINES[view]}
            {data?.mode === "local" && (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">
                local store · {data.feedback.length} items
              </span>
            )}
          </p>
        </header>

        <ActiveSection />
      </div>
    </div>
  );
}
