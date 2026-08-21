import { z } from "zod";

export const FeedbackSourceSchema = z.enum(["playstore", "ticket"]);

export const NormalizedFeedbackSchema = z.object({
  id: z.string().uuid().optional(),
  source: FeedbackSourceSchema,
  company: z.string().min(1),
  text: z.string().min(1),
  rating: z.number().min(0).max(5).nullable(),
  timestamp: z.string().datetime({ offset: true }).or(z.string().min(1)),
  customer_id: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  external_id: z.string().nullable().optional(),
});

export type NormalizedFeedback = z.infer<typeof NormalizedFeedbackSchema>;

export const PainPointOutputSchema = z.object({
  pain_point_summary: z.string().min(1),
  severity: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  product_area: z.string().min(1),
});

export const TriageOutputSchema = z.object({
  feedback_type: z.enum(["bug", "feature_request", "question", "other"]),
  rationale: z.string().min(1),
});

export const ChurnOutputSchema = z.object({
  churn_risk: z.enum(["none", "low", "medium", "high"]),
  churn_signal: z.string(),
  signal_type: z.enum([
    "cancellation_intent",
    "competitor_mention",
    "repeated_complaint",
    "frustration_escalation",
    "none",
  ]),
});

export const ClusterLabelOutputSchema = z.object({
  cluster_label: z.string().min(1),
  cluster_summary: z.string().min(1),
  representative_quotes: z.array(z.string()).min(1).max(5),
});

export const FeatureOutputSchema = z.object({
  features: z
    .array(
      z.object({
        feature_name: z.string().min(1),
        description: z.string().min(1),
        effort_estimate: z.enum(["XS", "S", "M", "L", "XL"]),
      })
    )
    .min(1)
    .max(3),
});

export const RoadmapOutputSchema = z.object({
  now: z.array(
    z.object({
      feature_name: z.string(),
      rationale: z.string(),
    })
  ),
  next: z.array(
    z.object({
      feature_name: z.string(),
      rationale: z.string(),
    })
  ),
  later: z.array(
    z.object({
      feature_name: z.string(),
      rationale: z.string(),
    })
  ),
});

export const CoreAnalysisOutputSchema = z.object({
  sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]),
  churn_risk_score: z.number().min(0).max(1),
  primary_pain_point: z.string().min(1),
  category: z.enum([
    "UI/UX",
    "PERFORMANCE",
    "BILLING",
    "FEATURE_REQUEST",
    "BUG",
    "OTHER",
  ]),
  key_quotes: z.array(z.string()),
  actionable_recommendation: z.string().min(1),
  zendesk_priority_escalation: z.boolean(),
});

export const AISuggestionSchema = z.object({
  suggestions: z
    .array(
      z.object({
        priority: z.enum(["Urgent", "High", "Medium"]),
        headline: z.string(),
        explanation: z.string(),
        linked_feature: z.string(),
      })
    )
    .min(3)
    .max(5),
});
