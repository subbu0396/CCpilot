import { FeatureOutputSchema } from "@/lib/ingestion/schema";
import type {
  Cluster,
  Feature,
  EffortEstimate,
  ChurnRisk,
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

const SYSTEM = `You propose 1–3 concrete product features that would address a cluster of customer pain points.
Return ONLY JSON:
{
  "features": [
    {
      "feature_name": "short name",
      "description": "one paragraph",
      "effort_estimate": "XS"|"S"|"M"|"L"|"XL"
    }
  ]
}`;

function churnWeight(risk: ChurnRisk | undefined): number {
  if (!risk) return 1;
  return { none: 1, low: 1.1, medium: 1.35, high: 1.7 }[risk];
}

function heuristicFeatures(
  cluster: Cluster
): { feature_name: string; description: string; effort_estimate: EffortEstimate }[] {
  const label = cluster.cluster_label;
  const primaryEffort: EffortEstimate =
    cluster.item_count > 40 ? "L" : cluster.item_count > 20 ? "M" : "S";
  return [
    {
      feature_name: `Improve ${label}`,
      description: `Ship targeted fixes for "${label}" based on ${cluster.item_count} related feedback items. ${cluster.cluster_summary}`,
      effort_estimate: primaryEffort,
    },
    {
      feature_name: `${label} instrumentation`,
      description: `Add telemetry and in-product guidance around ${label.toLowerCase()} to catch regressions earlier.`,
      effort_estimate: "S" as EffortEstimate,
    },
  ].slice(0, cluster.avg_severity && cluster.avg_severity >= 4 ? 2 : 1);
}

function latestClusters(): Cluster[] {
  if (isLocalMode()) {
    const db = readDb();
    if (!db.clusters.length) return [];
    const latestRun = db.clusters[0].run_id;
    return db.clusters.filter((c) => c.run_id === latestRun);
  }
  return [];
}

async function loadClusters(): Promise<Cluster[]> {
  if (isLocalMode()) return latestClusters();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("clusters")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Cluster[];
  if (!rows.length) return [];
  const runId = rows[0].run_id;
  return rows.filter((c) => c.run_id === runId);
}

function avgChurnForCluster(clusterId: string): ChurnRisk | undefined {
  if (!isLocalMode()) return undefined;
  const db = readDb();
  const memberIds = db.feedback_clusters
    .filter((m) => m.cluster_id === clusterId)
    .map((m) => m.feedback_item_id);
  const risks = db.churn_signals
    .filter((c) => memberIds.includes(c.feedback_item_id))
    .map((c) => c.churn_risk);
  if (!risks.length) return undefined;
  const rank = { none: 0, low: 1, medium: 2, high: 3 } as const;
  const avg =
    risks.reduce((s, r) => s + rank[r], 0) / risks.length;
  if (avg >= 2.5) return "high";
  if (avg >= 1.5) return "medium";
  if (avg >= 0.5) return "low";
  return "none";
}

export async function runFeatures(): Promise<{
  created: number;
  jobId: string;
  mode: string;
}> {
  const clusters = await loadClusters();
  if (!clusters.length) {
    throw new Error("No clusters found — run clustering first");
  }

  const job = await startJob("features", clusters.length);
  let usage: TokenUsage = emptyUsage();
  const mode = hasAnthropicKey() ? "claude" : "heuristic";
  const created: Feature[] = [];

  try {
    for (const cluster of clusters) {
      let proposals;
      if (hasAnthropicKey()) {
        const r = await cachedJsonCompletion({
          system: SYSTEM,
          user: JSON.stringify({
            cluster_label: cluster.cluster_label,
            cluster_summary: cluster.cluster_summary,
            quotes: cluster.representative_quotes,
            item_count: cluster.item_count,
            avg_severity: cluster.avg_severity,
          }),
          schema: FeatureOutputSchema,
        });
        proposals = r.data.features;
        usage = mergeUsage(usage, r.usage);
      } else {
        proposals = heuristicFeatures(cluster);
      }

      const cw = churnWeight(avgChurnForCluster(cluster.id));
      for (const p of proposals) {
        const impact_score = Number(
          (
            cluster.item_count *
            (cluster.avg_severity ?? 3) *
            cw
          ).toFixed(2)
        );
        created.push({
          id: newId(),
          cluster_id: cluster.id,
          feature_name: p.feature_name,
          description: p.description,
          impact_score,
          effort_estimate: p.effort_estimate,
          created_at: new Date().toISOString(),
        });
      }
    }

    if (isLocalMode()) {
      const db = readDb();
      const clusterIds = new Set(clusters.map((c) => c.id));
      db.features = [
        ...created,
        ...db.features.filter((f) => !clusterIds.has(f.cluster_id)),
      ];
      writeDb(db);
    } else {
      const supabase = createServiceClient();
      // Idempotent: delete features for these clusters then insert
      for (const c of clusters) {
        await supabase.from("features").delete().eq("cluster_id", c.id);
      }
      const { error } = await supabase.from("features").insert(created as never);
      if (error) throw new Error(error.message);
    }

    await finishJob(job.id, {
      status: "completed",
      records_processed: created.length,
      usage,
      metadata: { mode },
    });
    return { created: created.length, jobId: job.id, mode };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishJob(job.id, {
      status: "failed",
      records_processed: created.length,
      usage,
      error_message: msg,
    });
    throw err;
  }
}
