import { kmeans } from "ml-kmeans";
import { ClusterLabelOutputSchema } from "@/lib/ingestion/schema";
import type { Cluster, PainPoint } from "@/lib/supabase/types";
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

const LABEL_SYSTEM = `You label a cluster of customer pain-point summaries.
Return ONLY JSON:
{
  "cluster_label": "short title",
  "cluster_summary": "2-3 sentence summary",
  "representative_quotes": ["quote1","quote2","quote3"]
}
representative_quotes must be verbatim from the provided summaries (pick up to 3).`;

function hasVoyageKey(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY);
}

/** Simple bag-of-words embedding for heuristic/demo mode (dimension 64). */
function hashEmbed(text: string, dim = 64): number[] {
  const vec = new Array(dim).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
  for (const t of tokens) {
    let h = 0;
    for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
    vec[h % dim] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

async function voyageEmbed(texts: string[]): Promise<number[][]> {
  const VoyageAI = await import("voyageai");
  const client = new VoyageAI.VoyageAIClient({
    apiKey: process.env.VOYAGE_API_KEY,
  });
  const res = await client.embed({
    input: texts,
    model: "voyage-large-2-instruct",
  });
  return (res.data ?? []).map((d) => d.embedding as number[]);
}

/**
 * Feedback items explicitly triaged "bug" or "question" (Feature-Request
 * Triage Agent, lib/pipeline/triage.ts) shouldn't become candidate roadmap
 * features. A feedback item with no triage row yet (triage never run, or
 * hasn't reached it) is included by default — this only excludes items
 * explicitly triaged out, so untriaged historical data isn't dropped.
 */
async function excludedFromClustering(): Promise<Set<string>> {
  if (isLocalMode()) {
    const db = readDb();
    return new Set(
      db.feedback_triage
        .filter((t) => t.feedback_type === "bug" || t.feedback_type === "question")
        .map((t) => t.feedback_item_id)
    );
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("feedback_triage")
    .select("feedback_item_id, feedback_type")
    .in("feedback_type", ["bug", "question"]);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { feedback_item_id: string; feedback_type: string }[];
  return new Set(rows.map((r) => r.feedback_item_id));
}

async function loadPainPoints(): Promise<
  (PainPoint & { feedback_text?: string })[]
> {
  const excluded = await excludedFromClustering();

  if (isLocalMode()) {
    const db = readDb();
    return db.pain_points
      .filter((p) => !excluded.has(p.feedback_item_id))
      .map((p) => {
        const fb = db.feedback_items.find((f) => f.id === p.feedback_item_id);
        return { ...p, feedback_text: fb?.text };
      });
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("pain_points").select("*");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as PainPoint[];
  return rows.filter((p) => !excluded.has(p.feedback_item_id));
}

function heuristicLabel(
  summaries: string[],
  index: number
): {
  cluster_label: string;
  cluster_summary: string;
  representative_quotes: string[];
} {
  const joined = summaries.join(" ").toLowerCase();
  const themes: [string, RegExp][] = [
    ["Onboarding Friction", /onboard|invite|sso|setup/],
    ["Permissions & Access", /permission|role|guest|private/],
    ["Mobile Sync Issues", /mobile|sync|offline/],
    ["Reporting Gaps", /report|forecast|custom report/],
    ["Integration Failures", /sync|salesforce|hubspot|integrat|connector/],
    ["Pipeline Performance", /pipeline|freeze|deal stage/],
    ["Query Performance", /timeout|slow|quer|performance|warehouse/],
    ["Export Limits", /export|csv|truncat|pdf/],
    ["Dashboard UX", /dashboard|widget|drag|ux/],
    ["Positive Feedback", /love|great|excellent|saved|win/],
  ];
  const hit = themes.find(([, re]) => re.test(joined));
  const label = hit?.[0] ?? `Theme Cluster ${index + 1}`;
  return {
    cluster_label: label,
    cluster_summary: `Cluster of ${summaries.length} related pain points around ${label.toLowerCase()}. Dominant patterns emerge from severity-weighted customer language.`,
    representative_quotes: summaries.slice(0, 3),
  };
}

export async function runClustering(opts?: {
  k?: number;
}): Promise<{ clusters: number; jobId: string; mode: string }> {
  const k = opts?.k ?? Number(process.env.CLUSTER_K || 8);
  const painPoints = await loadPainPoints();
  if (painPoints.length < k) {
    throw new Error(
      `Need at least ${k} pain points to cluster (have ${painPoints.length}). Run pain_points first.`
    );
  }

  const job = await startJob("cluster", painPoints.length);
  let usage: TokenUsage = emptyUsage();
  const embedMode = hasVoyageKey() ? "voyage" : "hash";
  let labelMode = hasAnthropicKey() ? "claude" : "heuristic";

  try {
    const texts = painPoints.map((p) => p.pain_point_summary);
    const vectors =
      embedMode === "voyage"
        ? await voyageEmbed(texts)
        : texts.map((t) => hashEmbed(t));

    // Persist embeddings locally / skip pgvector write in heuristic
    if (isLocalMode()) {
      const db = readDb();
      for (let i = 0; i < painPoints.length; i++) {
        const idx = db.pain_points.findIndex((p) => p.id === painPoints[i].id);
        if (idx >= 0) db.pain_points[idx].embedding = vectors[i];
      }
      writeDb(db);
    }

    const result = kmeans(vectors, k, { initialization: "kmeans++" });
    const runId = newId();

    // Group indices by cluster
    const groups: number[][] = Array.from({ length: k }, () => []);
    result.clusters.forEach((c: number, i: number) => {
      groups[c].push(i);
    });

    const newClusters: Cluster[] = [];
    const memberships: {
      feedback_item_id: string;
      cluster_id: string;
      run_id: string;
    }[] = [];

    for (let ci = 0; ci < k; ci++) {
      const idxs = groups[ci];
      if (!idxs.length) continue;
      const summaries = idxs.map((i) => painPoints[i].pain_point_summary);
      const avgSev =
        idxs.reduce((s, i) => s + painPoints[i].severity, 0) / idxs.length;

      let label;
      if (hasAnthropicKey()) {
        try {
          const r = await cachedJsonCompletion({
            system: LABEL_SYSTEM,
            user: JSON.stringify({ summaries: summaries.slice(0, 40) }),
            schema: ClusterLabelOutputSchema,
          });
          label = r.data;
          usage = mergeUsage(usage, r.usage);
        } catch {
          label = heuristicLabel(summaries, ci);
          labelMode = "heuristic";
        }
      } else {
        label = heuristicLabel(summaries, ci);
      }

      const cluster: Cluster = {
        id: newId(),
        cluster_index: ci,
        cluster_label: label.cluster_label,
        cluster_summary: label.cluster_summary,
        representative_quotes: label.representative_quotes.slice(0, 3),
        item_count: idxs.length,
        avg_severity: Number(avgSev.toFixed(2)),
        k,
        run_id: runId,
        created_at: new Date().toISOString(),
      };
      newClusters.push(cluster);
      for (const i of idxs) {
        memberships.push({
          feedback_item_id: painPoints[i].feedback_item_id,
          cluster_id: cluster.id,
          run_id: runId,
        });
      }
    }

    if (isLocalMode()) {
      const db = readDb();
      // Replace clusters for this logical latest run (keep history lightly)
      db.clusters = [...newClusters, ...db.clusters];
      db.feedback_clusters = [
        ...memberships,
        ...db.feedback_clusters.filter((m) => m.run_id !== runId),
      ];
      db.cluster_runs.unshift({
        id: runId,
        k,
        status: "completed",
        created_at: new Date().toISOString(),
      });
      writeDb(db);
    } else {
      const supabase = createServiceClient();
      const { error: cErr } = await supabase
        .from("clusters")
        .insert(newClusters as never);
      if (cErr) throw new Error(cErr.message);
      const { error: mErr } = await supabase
        .from("feedback_clusters")
        .upsert(memberships as never);
      if (mErr) throw new Error(mErr.message);
    }

    await finishJob(job.id, {
      status: "completed",
      records_processed: painPoints.length,
      usage,
      metadata: { k, runId, embedMode, labelMode },
    });
    return {
      clusters: newClusters.length,
      jobId: job.id,
      mode: `${embedMode}+${labelMode}`,
    };
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
