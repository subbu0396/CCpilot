import { z } from "zod";
import { loadDashboardBundle, type DashboardBundle } from "@/lib/store/dashboard-data";
import { cachedJsonCompletion, hasAnthropicKey } from "@/lib/pipeline/claude";
import type { ChurnRisk, EffortEstimate } from "@/lib/supabase/types";

/**
 * Mirrors lib/pipeline/roadmap.ts / lib/pipeline/features.ts constants —
 * duplicated deliberately (same pattern as tools/actions.ts's
 * createJiraForRoadmapItem) rather than importing pipeline-internal,
 * non-exported values.
 */
const EFFORT_MAP: Record<EffortEstimate, number> = { XS: 1, S: 2, M: 3, L: 4, XL: 5 };
const CHURN_WEIGHT: Record<ChurnRisk, number> = { none: 1, low: 1.1, medium: 1.35, high: 1.7 };
const CHURN_RANK: Record<ChurnRisk, number> = { none: 0, low: 1, medium: 2, high: 3 };

interface ScoringTrail {
  roadmap_id: string;
  feature_name: string;
  bucket: string;
  stored_rationale: string;
  impact_score: number;
  effort_estimate: EffortEstimate;
  effort_weight: number;
  score: number;
  formula_bucket: string;
  formula_detail: string;
  matches_formula: boolean;
  cluster_label: string | null;
  avg_severity: number | null;
  item_count: number | null;
  churn_risk_level: ChurnRisk;
  churn_weight: number;
  representative_quotes: string[];
}

/**
 * Re-derives cluster churn-risk level in memory from DashboardBundle, mirroring
 * features.ts's avgChurnForCluster — but mode-agnostic (that function is
 * local-mode only and silently returns "none" weight in Supabase/production
 * mode). Deliberately not fixed in the pipeline itself; re-derived here at
 * read time so the justification stays accurate without risking a change to
 * real pipeline scoring behavior.
 */
function clusterChurnRisk(bundle: DashboardBundle, clusterId: string): ChurnRisk {
  const memberIds = new Set(
    bundle.feedbackClusters.filter((m) => m.cluster_id === clusterId).map((m) => m.feedback_item_id)
  );
  const risks = bundle.churnSignals
    .filter((c) => memberIds.has(c.feedback_item_id))
    .map((c) => c.churn_risk);
  if (!risks.length) return "none";
  const avg = risks.reduce((sum, r) => sum + CHURN_RANK[r], 0) / risks.length;
  if (avg >= 2.5) return "high";
  if (avg >= 1.5) return "medium";
  if (avg >= 0.5) return "low";
  return "none";
}

/**
 * Recomputes what CCPilot's deterministic heuristic (lib/pipeline/roadmap.ts's
 * heuristicBuckets) would place this item into. Note this is NOT necessarily
 * what actually happened: runRoadmap() calls Claude first and only falls back
 * to this exact formula if there's no API key or the call fails, so an LLM
 * judgment call can (and does) disagree with the pure formula. Callers should
 * compare this against the item's real stored bucket rather than assume they
 * match.
 */
function computeFormulaBucket(
  score: number,
  effortWeight: number,
  impactScore: number
): { bucket: string; detail: string } {
  if (score >= 15 && effortWeight <= 3) {
    return { bucket: "now", detail: `score ${score.toFixed(1)} >= 15 and effort weight ${effortWeight} <= 3` };
  }
  if (score >= 8) {
    return { bucket: "next", detail: `score ${score.toFixed(1)} >= 8` };
  }
  if (impactScore >= 80 && effortWeight <= 2) {
    return { bucket: "next", detail: `impact ${impactScore} >= 80 and effort weight ${effortWeight} <= 2` };
  }
  return {
    bucket: "later",
    detail: `score ${score.toFixed(1)} < 8 and impact ${impactScore} doesn't clear the low-effort Next exception`,
  };
}

function buildScoringTrail(bundle: DashboardBundle, roadmapId: string): ScoringTrail {
  const item = bundle.roadmap.find((r) => r.id === roadmapId);
  if (!item) throw new Error(`Roadmap item ${roadmapId} not found.`);
  const feature = bundle.features.find((f) => f.id === item.feature_id);
  if (!feature) throw new Error(`Feature for roadmap item ${roadmapId} not found.`);
  const cluster = bundle.clusters.find((c) => c.id === feature.cluster_id) ?? null;

  const effort_weight = EFFORT_MAP[feature.effort_estimate];
  const score = feature.impact_score / effort_weight;
  const churn_risk_level = cluster ? clusterChurnRisk(bundle, cluster.id) : "none";
  const formula = computeFormulaBucket(score, effort_weight, feature.impact_score);

  return {
    roadmap_id: item.id,
    feature_name: feature.feature_name,
    bucket: item.bucket,
    stored_rationale: item.rationale,
    impact_score: feature.impact_score,
    effort_estimate: feature.effort_estimate,
    effort_weight,
    score: Number(score.toFixed(2)),
    formula_bucket: formula.bucket,
    formula_detail: formula.detail,
    matches_formula: formula.bucket === item.bucket,
    cluster_label: cluster?.cluster_label ?? null,
    avg_severity: cluster?.avg_severity ?? null,
    item_count: cluster?.item_count ?? null,
    churn_risk_level,
    churn_weight: CHURN_WEIGHT[churn_risk_level],
    representative_quotes: cluster?.representative_quotes?.slice(0, 3) ?? [],
  };
}

function formulaSentence(trail: ScoringTrail): string {
  return trail.matches_formula
    ? `The pure impact/effort formula agrees: ${trail.formula_detail} → ${trail.formula_bucket.toUpperCase()}.`
    : `Note: the pure impact/effort formula alone would suggest ${trail.formula_bucket.toUpperCase()} (${trail.formula_detail}) — this item's actual placement in ${trail.bucket.toUpperCase()} reflects the pipeline's qualitative judgment call on top of the formula, recorded as: "${trail.stored_rationale}"`;
}

function templateExplanation(trail: ScoringTrail, trailB?: ScoringTrail): { explanation: string; key_factors: string[] } {
  const base = `"${trail.feature_name}" is in ${trail.bucket.toUpperCase()} (priority score ${trail.score} = impact ${trail.impact_score} / effort weight ${trail.effort_weight} for effort ${trail.effort_estimate}). ${formulaSentence(trail)}`;
  const factors = [
    `Impact score ${trail.impact_score} = ${trail.item_count ?? "?"} feedback items x avg severity ${trail.avg_severity ?? "3 (default)"} x churn weight ${trail.churn_weight} (${trail.churn_risk_level} churn risk in this cluster)`,
    `Effort ${trail.effort_estimate} (weight ${trail.effort_weight}) → score ${trail.score}`,
    formulaSentence(trail),
  ];

  if (!trailB) return { explanation: base, key_factors: factors };

  const delta = Number((trail.score - trailB.score).toFixed(2));
  const comparison = `Compared to "${trailB.feature_name}" (${trailB.bucket.toUpperCase()}, score ${trailB.score}): a score difference of ${delta >= 0 ? "+" : ""}${delta}. ${formulaSentence(trailB)}`;
  return {
    explanation: `${base} ${comparison}`,
    key_factors: [
      ...factors,
      `"${trailB.feature_name}": impact ${trailB.impact_score}, effort ${trailB.effort_estimate}, score ${trailB.score} — ${formulaSentence(trailB)}`,
    ],
  };
}

const ExplanationSchema = z.object({
  explanation: z.string(),
  key_factors: z.array(z.string()),
});

const SYSTEM = `You explain why a product roadmap item was placed into its bucket (Now/Next/Later),
strictly grounded in the scoring numbers provided — do not invent reasoning beyond the given data.
Each item includes "bucket" (its real, actual placement) and "formula_bucket" (what a pure
impact/effort formula alone would suggest) plus "matches_formula" (whether they agree). When
they disagree, that is NOT an error — bucket placement can be a judgment call layered on top of
the formula, so explain the mismatch using the item's "stored_rationale", don't treat it as a
contradiction. If a second item is provided for comparison, explain the difference in plain
language a non-technical stakeholder could follow. Return ONLY JSON:
{ "explanation": "2-4 sentences", "key_factors": ["short bullet", "..."] }`;

export async function explainRoadmapItem({
  roadmap_id,
  compare_to_id,
}: {
  roadmap_id: string;
  compare_to_id?: string;
}) {
  const bundle = await loadDashboardBundle();
  const trail = buildScoringTrail(bundle, roadmap_id);
  const trailB = compare_to_id ? buildScoringTrail(bundle, compare_to_id) : undefined;

  if (hasAnthropicKey()) {
    try {
      const { data } = await cachedJsonCompletion({
        system: SYSTEM,
        user: JSON.stringify(trailB ? { item: trail, compare_to: trailB } : { item: trail }),
        schema: ExplanationSchema,
      });
      return { trail, trail_b: trailB, ...data };
    } catch {
      // fall through to deterministic template
    }
  }

  return { trail, trail_b: trailB, ...templateExplanation(trail, trailB) };
}
