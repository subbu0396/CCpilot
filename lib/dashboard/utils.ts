import type {
  FeedbackItem,
  PainPoint,
  ChurnSignal,
  Cluster,
  Feature,
  RoadmapItem,
  FeedbackSource,
} from "@/lib/supabase/types";
import type { FilterState } from "@/lib/filters/context";

export interface EnrichedFeedback {
  feedback: FeedbackItem;
  painPoint?: PainPoint;
  churn?: ChurnSignal;
}

export function applyFilters(
  feedback: FeedbackItem[],
  painPoints: PainPoint[],
  churnSignals: ChurnSignal[],
  filters: FilterState
): EnrichedFeedback[] {
  const ppByFb = new Map(painPoints.map((p) => [p.feedback_item_id, p]));
  const churnByFb = new Map(
    churnSignals.map((c) => [c.feedback_item_id, c])
  );

  return feedback
    .filter((f) => filters.companies.includes(f.company))
    .filter((f) => filters.sources.includes(f.source))
    .filter((f) => f.timestamp >= filters.dateFrom)
    .filter((f) => f.timestamp <= filters.dateTo + "T23:59:59.999Z")
    .map((f) => ({
      feedback: f,
      painPoint: ppByFb.get(f.id),
      churn: churnByFb.get(f.id),
    }))
    .filter((row) => {
      const sev = row.painPoint?.severity;
      if (sev === undefined) return true;
      return sev >= filters.severityMin && sev <= filters.severityMax;
    });
}

export function sourceMix(
  items: { source: FeedbackSource }[]
): Record<FeedbackSource, number> {
  const mix: Record<FeedbackSource, number> = {
    playstore: 0,
    ticket: 0,
  };
  for (const i of items) mix[i.source] += 1;
  return mix;
}

export function weekKey(iso: string): string {
  const d = new Date(iso);
  const onejan = new Date(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(
    ((d.getTime() - onejan.getTime()) / 86400000 + onejan.getUTCDay() + 1) / 7
  );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export type { Cluster, Feature, RoadmapItem };
