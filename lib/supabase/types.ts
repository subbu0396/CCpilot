export type FeedbackSource = "playstore" | "g2" | "ticket";
export type Sentiment = "positive" | "neutral" | "negative";
export type ChurnRisk = "none" | "low" | "medium" | "high";
export type SignalType =
  | "cancellation_intent"
  | "competitor_mention"
  | "repeated_complaint"
  | "frustration_escalation"
  | "none";
export type EffortEstimate = "XS" | "S" | "M" | "L" | "XL";
export type RoadmapBucket = "now" | "next" | "later";
export type PipelineStage =
  | "pain_points"
  | "churn"
  | "cluster"
  | "features"
  | "roadmap";
export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface FeedbackItem {
  id: string;
  source: FeedbackSource;
  company: string;
  text: string;
  rating: number | null;
  timestamp: string;
  customer_id: string | null;
  metadata: Record<string, unknown>;
  created_at?: string;
  external_id?: string | null;
}

export interface PainPoint {
  id: string;
  feedback_item_id: string;
  pain_point_summary: string;
  severity: 1 | 2 | 3 | 4 | 5;
  sentiment: Sentiment;
  product_area: string;
  embedding?: number[] | null;
  created_at?: string;
  updated_at?: string;
}

export interface ChurnSignal {
  id: string;
  feedback_item_id: string;
  churn_risk: ChurnRisk;
  churn_signal: string;
  signal_type: SignalType;
  weighted_score?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface Cluster {
  id: string;
  cluster_index: number;
  cluster_label: string;
  cluster_summary: string;
  representative_quotes: string[];
  item_count: number;
  avg_severity: number | null;
  k: number;
  run_id: string;
  created_at?: string;
}

export interface Feature {
  id: string;
  cluster_id: string;
  feature_name: string;
  description: string;
  impact_score: number;
  effort_estimate: EffortEstimate;
  created_at?: string;
}

export interface RoadmapItem {
  id: string;
  feature_id: string;
  bucket: RoadmapBucket;
  rationale: string;
  sort_order: number;
  manually_overridden: boolean;
  run_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface PipelineJob {
  id: string;
  stage: PipelineStage;
  status: JobStatus;
  company_filter: string | null;
  records_processed: number;
  records_total: number;
  error_message: string | null;
  token_usage: Record<string, unknown>;
  estimated_cost_usd: number | null;
  metadata: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface AISuggestion {
  priority: "Urgent" | "High" | "Medium";
  headline: string;
  explanation: string;
  linked_feature: string;
}

export interface Database {
  public: {
    Tables: {
      feedback_items: {
        Row: FeedbackItem;
        Insert: Omit<FeedbackItem, "id"> & { id?: string };
        Update: Partial<FeedbackItem>;
      };
      pain_points: {
        Row: PainPoint;
        Insert: Omit<PainPoint, "id"> & { id?: string };
        Update: Partial<PainPoint>;
      };
      churn_signals: {
        Row: ChurnSignal;
        Insert: Omit<ChurnSignal, "id"> & { id?: string };
        Update: Partial<ChurnSignal>;
      };
      clusters: {
        Row: Cluster;
        Insert: Omit<Cluster, "id"> & { id?: string };
        Update: Partial<Cluster>;
      };
      features: {
        Row: Feature;
        Insert: Omit<Feature, "id"> & { id?: string };
        Update: Partial<Feature>;
      };
      roadmap: {
        Row: RoadmapItem;
        Insert: Omit<RoadmapItem, "id"> & { id?: string };
        Update: Partial<RoadmapItem>;
      };
      pipeline_jobs: {
        Row: PipelineJob;
        Insert: Omit<PipelineJob, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<PipelineJob>;
      };
      ai_suggestions_cache: {
        Row: {
          id: string;
          filter_key: string;
          suggestions: AISuggestion[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          filter_key: string;
          suggestions: AISuggestion[];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          filter_key: string;
          suggestions: AISuggestion[];
          updated_at: string;
        }>;
      };
      feedback_clusters: {
        Row: {
          feedback_item_id: string;
          cluster_id: string;
          run_id: string;
        };
        Insert: {
          feedback_item_id: string;
          cluster_id: string;
          run_id: string;
        };
        Update: Partial<{
          feedback_item_id: string;
          cluster_id: string;
          run_id: string;
        }>;
      };
    };
  };
}
