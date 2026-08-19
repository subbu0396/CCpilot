/**
 * Local JSON store used when Supabase env vars are absent.
 * Enables full demo of ingest → pipeline → dashboard without cloud credentials.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  FeedbackItem,
  PainPoint,
  ChurnSignal,
  Cluster,
  Feature,
  RoadmapItem,
  PipelineJob,
  AISuggestion,
  CoreAnalysis,
} from "@/lib/supabase/types";

export interface LocalDb {
  feedback_items: FeedbackItem[];
  pain_points: PainPoint[];
  churn_signals: ChurnSignal[];
  core_analysis: CoreAnalysis[];
  clusters: Cluster[];
  feedback_clusters: {
    feedback_item_id: string;
    cluster_id: string;
    run_id: string;
  }[];
  features: Feature[];
  roadmap: RoadmapItem[];
  pipeline_jobs: PipelineJob[];
  ai_suggestions_cache: {
    id: string;
    filter_key: string;
    suggestions: AISuggestion[];
    created_at: string;
    updated_at: string;
  }[];
  cluster_runs: { id: string; k: number; status: string; created_at: string }[];
}

const DATA_DIR = join(process.cwd(), "data");
const DB_PATH = join(DATA_DIR, "local-db.json");

function emptyDb(): LocalDb {
  return {
    feedback_items: [],
    pain_points: [],
    churn_signals: [],
    core_analysis: [],
    clusters: [],
    feedback_clusters: [],
    features: [],
    roadmap: [],
    pipeline_jobs: [],
    ai_suggestions_cache: [],
    cluster_runs: [],
  };
}

export function isLocalMode(): boolean {
  return (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.USE_LOCAL_STORE === "1"
  );
}

export function readDb(): LocalDb {
  if (!existsSync(DB_PATH)) {
    mkdirSync(DATA_DIR, { recursive: true });
    const db = emptyDb();
    writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    return db;
  }
  return JSON.parse(readFileSync(DB_PATH, "utf8")) as LocalDb;
}

export function writeDb(db: LocalDb): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export function newId(): string {
  return randomUUID();
}

export { DB_PATH };
