import { RoadmapOutputSchema } from "@/lib/ingestion/schema";
import type {
  Feature,
  RoadmapItem,
  RoadmapBucket,
  EffortEstimate,
} from "@/lib/supabase/types";
import { isLocalMode, readDb, writeDb, newId } from "@/lib/store/local-db";
import { createServiceClient } from "@/lib/supabase/client";
import {
  cachedJsonCompletion,
  emptyUsage,
  hasAnthropicKey,
  mergeUsage,
  type TokenUsage,
} from "./claude";
import { startJob, finishJob } from "./jobs";

const EFFORT_MAP: Record<EffortEstimate, number> = {
  XS: 1,
  S: 2,
  M: 3,
  L: 4,
  XL: 5,
};

const SYSTEM = `You place product features into a Now / Next / Later roadmap.
Rules of thumb:
- now: high impact, low-medium effort
- next: high impact + high effort OR medium impact + low effort
- later: low impact or very high effort
Return ONLY JSON:
{
  "now": [{"feature_name":"...","rationale":"one line"}],
  "next": [{"feature_name":"...","rationale":"one line"}],
  "later": [{"feature_name":"...","rationale":"one line"}]
}
Every input feature_name must appear exactly once across the three buckets.`;

function score(f: Feature): number {
  return f.impact_score / EFFORT_MAP[f.effort_estimate];
}

function heuristicBuckets(features: Feature[]): {
  now: { feature_name: string; rationale: string }[];
  next: { feature_name: string; rationale: string }[];
  later: { feature_name: string; rationale: string }[];
} {
  const sorted = [...features].sort((a, b) => score(b) - score(a));
  const now: typeof sorted = [];
  const next: typeof sorted = [];
  const later: typeof sorted = [];

  for (const f of sorted) {
    const effort = EFFORT_MAP[f.effort_estimate];
    const s = score(f);
    if (s >= 15 && effort <= 3) now.push(f);
    else if (s >= 8 || (f.impact_score >= 80 && effort <= 2)) next.push(f);
    else later.push(f);
  }

  // Ensure now isn't empty if we have high scorers
  if (!now.length && sorted.length) {
    now.push(sorted[0]);
    const rm = next.findIndex((x) => x.id === sorted[0].id);
    if (rm >= 0) next.splice(rm, 1);
    const rm2 = later.findIndex((x) => x.id === sorted[0].id);
    if (rm2 >= 0) later.splice(rm2, 1);
  }

  const toEntry = (f: Feature, bucket: RoadmapBucket) => ({
    feature_name: f.feature_name,
    rationale:
      bucket === "now"
        ? `High impact/effort ratio (${score(f).toFixed(1)}) — ship soon`
        : bucket === "next"
          ? `Strong impact but effort ${f.effort_estimate} — plan next`
          : `Lower priority given impact ${f.impact_score} and effort ${f.effort_estimate}`,
  });

  return {
    now: now.map((f) => toEntry(f, "now")),
    next: next.map((f) => toEntry(f, "next")),
    later: later.map((f) => toEntry(f, "later")),
  };
}

async function loadFeatures(): Promise<Feature[]> {
  if (isLocalMode()) {
    const db = readDb();
    const latestRun = db.clusters[0]?.run_id;
    const clusterIds = new Set(
      db.clusters.filter((c) => c.run_id === latestRun).map((c) => c.id)
    );
    return db.features.filter((f) => clusterIds.has(f.cluster_id));
  }
  const supabase = createServiceClient();
  const { data: clusterRows, error: clusterError } = await supabase
    .from("clusters")
    .select("id, run_id")
    .order("created_at", { ascending: false });
  if (clusterError) throw new Error(clusterError.message);
  const clusters = (clusterRows ?? []) as { id: string; run_id: string }[];
  if (!clusters.length) return [];
  const latestRun = clusters[0].run_id;
  const clusterIds = new Set(
    clusters.filter((c) => c.run_id === latestRun).map((c) => c.id)
  );

  const { data, error } = await supabase.from("features").select("*");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Feature[]).filter((f) => clusterIds.has(f.cluster_id));
}

export async function runRoadmap(): Promise<{
  items: number;
  jobId: string;
  mode: string;
}> {
  const features = await loadFeatures();
  if (!features.length) {
    throw new Error("No features found — run features stage first");
  }

  const job = await startJob("roadmap", features.length);
  let usage: TokenUsage = emptyUsage();
  let mode = hasAnthropicKey() ? "claude" : "heuristic";
  const runId = newId();

  try {
    let buckets;
    if (hasAnthropicKey()) {
      try {
        const r = await cachedJsonCompletion({
          system: SYSTEM,
          user: JSON.stringify(
            features.map((f) => ({
              feature_name: f.feature_name,
              description: f.description,
              impact_score: f.impact_score,
              effort_estimate: f.effort_estimate,
              score: score(f),
            }))
          ),
          schema: RoadmapOutputSchema,
        });
        buckets = r.data;
        usage = mergeUsage(usage, r.usage);
      } catch {
        buckets = heuristicBuckets(features);
        mode = "heuristic";
      }
    } else {
      buckets = heuristicBuckets(features);
    }

    const byName = new Map(features.map((f) => [f.feature_name, f]));
    const items: RoadmapItem[] = [];
    let order = 0;
    for (const bucket of ["now", "next", "later"] as const) {
      for (const entry of buckets[bucket]) {
        const feature = byName.get(entry.feature_name);
        if (!feature) continue;
        items.push({
          id: newId(),
          feature_id: feature.id,
          bucket,
          rationale: entry.rationale,
          sort_order: order++,
          manually_overridden: false,
          run_id: runId,
          jira_issue_key: null,
          jira_issue_url: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }

    // Place any missing features into later
    const placed = new Set(items.map((i) => i.feature_id));
    for (const f of features) {
      if (placed.has(f.id)) continue;
      items.push({
        id: newId(),
        feature_id: f.id,
        bucket: "later",
        rationale: "Unassigned by model — defaulted to later",
        sort_order: order++,
        manually_overridden: false,
        run_id: runId,
        jira_issue_key: null,
        jira_issue_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    if (isLocalMode()) {
      const db = readDb();
      db.roadmap = [...items, ...db.roadmap];
      writeDb(db);
    } else {
      const supabase = createServiceClient();
      const { error } = await supabase.from("roadmap").insert(items as never);
      if (error) throw new Error(error.message);
    }

    await finishJob(job.id, {
      status: "completed",
      records_processed: items.length,
      usage,
      metadata: { mode, runId },
    });
    return { items: items.length, jobId: job.id, mode };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishJob(job.id, {
      status: "failed",
      records_processed: 0,
      usage,
      error_message: msg,
    });
    throw err;
  }
}
