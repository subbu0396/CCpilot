import { loadDashboardBundle } from "@/lib/store/dashboard-data";
import type { ChurnRisk } from "@/lib/supabase/types";

export interface CustomerHealthBriefing {
  company: string;
  churn: Record<ChurnRisk, number>;
  top_pain_points: { summary: string; severity: number; product_area: string }[];
  recent_escalations: { summary: string; timestamp: string }[];
  roadmap_items: {
    feature_name: string;
    bucket: string;
    jira_issue_key: string | null;
    jira_issue_url: string | null;
  }[];
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function getCustomerHealthBriefing({
  company,
}: {
  company: string;
}): Promise<CustomerHealthBriefing> {
  const bundle = await loadDashboardBundle();
  const fbById = new Map(bundle.feedback.map((f) => [f.id, f]));
  const companyFeedbackIds = new Set(
    bundle.feedback.filter((f) => f.company === company).map((f) => f.id)
  );

  const churn: Record<ChurnRisk, number> = { none: 0, low: 0, medium: 0, high: 0 };
  for (const c of bundle.churnSignals) {
    if (companyFeedbackIds.has(c.feedback_item_id)) churn[c.churn_risk] += 1;
  }

  const top_pain_points = bundle.painPoints
    .filter((p) => companyFeedbackIds.has(p.feedback_item_id))
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 5)
    .map((p) => ({
      summary: p.pain_point_summary,
      severity: p.severity,
      product_area: p.product_area,
    }));

  const now = Date.now();
  const recent_escalations = bundle.coreAnalysis
    .filter((a) => a.zendesk_priority_escalation && companyFeedbackIds.has(a.feedback_item_id))
    .map((a) => {
      const fb = fbById.get(a.feedback_item_id);
      return fb ? { summary: a.primary_pain_point, timestamp: fb.timestamp } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .filter((r) => now - new Date(r.timestamp).getTime() <= THIRTY_DAYS_MS)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const featureById = new Map(bundle.features.map((f) => [f.id, f]));
  const roadmap_items = bundle.roadmap
    .map((r) => {
      const feature = featureById.get(r.feature_id);
      if (!feature) return null;
      const memberIds = new Set(
        bundle.feedbackClusters
          .filter((m) => m.cluster_id === feature.cluster_id)
          .map((m) => m.feedback_item_id)
      );
      const affectsCompany = Array.from(memberIds).some((id) => fbById.get(id)?.company === company);
      if (!affectsCompany) return null;
      return {
        feature_name: feature.feature_name,
        bucket: r.bucket,
        jira_issue_key: r.jira_issue_key,
        jira_issue_url: r.jira_issue_url,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return { company, churn, top_pain_points, recent_escalations, roadmap_items };
}
