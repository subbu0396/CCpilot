import { z } from "zod";

export const Sentiment = z.enum(["positive", "neutral", "negative", "mixed"]);
export type Sentiment = z.infer<typeof Sentiment>;

export const PainPointExtraction = z.object({
  feedback_item_id: z.string().uuid(),
  summary: z.string(),
  severity: z.number().int().min(1).max(5),
  sentiment: Sentiment,
  product_area: z.string(),
});
export type PainPointExtraction = z.infer<typeof PainPointExtraction>;

export const PainPointBatchResult = z.object({
  items: z.array(PainPointExtraction),
});
export type PainPointBatchResult = z.infer<typeof PainPointBatchResult>;

export const ChurnRiskLevel = z.enum(["none", "low", "medium", "high"]);
export type ChurnRiskLevel = z.infer<typeof ChurnRiskLevel>;

export const ChurnAssessment = z.object({
  feedback_item_id: z.string().uuid(),
  risk_level: ChurnRiskLevel,
  justification: z.string(),
});
export type ChurnAssessment = z.infer<typeof ChurnAssessment>;

export const ChurnBatchResult = z.object({
  items: z.array(ChurnAssessment),
});
export type ChurnBatchResult = z.infer<typeof ChurnBatchResult>;

export const ClusterLabelResult = z.object({
  label: z.string(),
  summary: z.string(),
});
export type ClusterLabelResult = z.infer<typeof ClusterLabelResult>;

export const FeatureSuggestion = z.object({
  feature_name: z.string(),
  description: z.string(),
  impact_estimate: z.enum(["low", "medium", "high"]),
  effort_size: z.enum(["S", "M", "L", "XL"]),
});
export type FeatureSuggestion = z.infer<typeof FeatureSuggestion>;

export const FeatureBatchResult = z.object({
  features: z.array(FeatureSuggestion),
});
export type FeatureBatchResult = z.infer<typeof FeatureBatchResult>;

export const RoadmapAssignment = z.object({
  feature_name: z.string(),
  bucket: z.enum(["now", "next", "later"]),
  rationale: z.string(),
});
export type RoadmapAssignment = z.infer<typeof RoadmapAssignment>;

export const RoadmapBatchResult = z.object({
  items: z.array(RoadmapAssignment),
});
export type RoadmapBatchResult = z.infer<typeof RoadmapBatchResult>;

export const ANALYSIS_STAGES = [
  "pain_points",
  "churn_risk",
  "embeddings",
  "clustering",
  "features",
  "roadmap",
] as const;
export type AnalysisStage = (typeof ANALYSIS_STAGES)[number];

export const SOURCE_CHURN_WEIGHTS: Record<string, number> = {
  call: 1.5,
  ticket: 1.3,
  review: 1.0,
  playstore: 0.8,
};
