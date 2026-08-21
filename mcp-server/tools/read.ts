import { loadDashboardBundle } from "@/lib/store/dashboard-data";
import type { RoadmapBucket } from "@/lib/supabase/types";

export async function getPainPoints({ limit = 10 }: { limit?: number }) {
  const { feedback, painPoints } = await loadDashboardBundle();
  const fbById = new Map(feedback.map((f) => [f.id, f]));

  return painPoints
    .map((p) => {
      const fb = fbById.get(p.feedback_item_id);
      if (!fb) return null;
      return {
        company: fb.company,
        source: fb.source,
        timestamp: fb.timestamp,
        severity: p.severity,
        sentiment: p.sentiment,
        product_area: p.product_area,
        summary: p.pain_point_summary,
        quote: fb.text,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, limit);
}

export async function getChurnRisk({
  limit = 10,
  company,
}: {
  limit?: number;
  company?: string;
}) {
  const { feedback, churnSignals } = await loadDashboardBundle();
  const fbById = new Map(feedback.map((f) => [f.id, f]));

  return churnSignals
    .filter((c) => c.churn_risk === "high")
    .map((c) => {
      const fb = fbById.get(c.feedback_item_id);
      if (!fb) return null;
      if (company && fb.company !== company) return null;
      return {
        company: fb.company,
        source: fb.source,
        timestamp: fb.timestamp,
        weighted_score: c.weighted_score ?? 0,
        signal_type: c.signal_type,
        signal: c.churn_signal,
        quote: fb.text,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.weighted_score - a.weighted_score)
    .slice(0, limit);
}

export async function getLiveAnalysis({
  limit = 10,
  company,
}: {
  limit?: number;
  company?: string;
}) {
  const { feedback, coreAnalysis } = await loadDashboardBundle();
  const fbById = new Map(feedback.map((f) => [f.id, f]));

  return coreAnalysis
    .map((a) => {
      const fb = fbById.get(a.feedback_item_id);
      if (!fb) return null;
      if (company && fb.company !== company) return null;
      return {
        company: fb.company,
        source: fb.source,
        timestamp: fb.timestamp,
        sentiment: a.sentiment,
        churn_risk_score: a.churn_risk_score,
        category: a.category,
        primary_pain_point: a.primary_pain_point,
        key_quotes: a.key_quotes,
        actionable_recommendation: a.actionable_recommendation,
        escalated: a.zendesk_priority_escalation,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.churn_risk_score - a.churn_risk_score)
    .slice(0, limit);
}

export async function getTriageQueue({
  limit = 10,
  company,
}: {
  limit?: number;
  company?: string;
}) {
  const { feedback, feedbackTriage } = await loadDashboardBundle();
  const fbById = new Map(feedback.map((f) => [f.id, f]));

  return feedbackTriage
    .filter((t) => t.feedback_type === "feature_request")
    .map((t) => {
      const fb = fbById.get(t.feedback_item_id);
      if (!fb) return null;
      if (company && fb.company !== company) return null;
      return {
        company: fb.company,
        source: fb.source,
        timestamp: fb.timestamp,
        rationale: t.rationale,
        quote: fb.text,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

export async function getRoadmap({ bucket }: { bucket?: RoadmapBucket }) {
  const { roadmap, features } = await loadDashboardBundle();
  const featureById = new Map(features.map((f) => [f.id, f]));

  return roadmap
    .filter((r) => !bucket || r.bucket === bucket)
    .map((r) => {
      const feature = featureById.get(r.feature_id);
      return {
        id: r.id,
        bucket: r.bucket,
        feature_name: feature?.feature_name ?? "(unknown feature)",
        description: feature?.description ?? null,
        impact_score: feature?.impact_score ?? null,
        effort_estimate: feature?.effort_estimate ?? null,
        rationale: r.rationale,
        manually_overridden: r.manually_overridden,
        jira_issue_key: r.jira_issue_key,
        jira_issue_url: r.jira_issue_url,
      };
    })
    .sort((a, b) => (b.impact_score ?? 0) - (a.impact_score ?? 0));
}
