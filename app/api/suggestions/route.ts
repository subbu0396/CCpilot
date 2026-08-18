import { NextRequest, NextResponse } from "next/server";
import { AISuggestionSchema } from "@/lib/ingestion/schema";
import { loadDashboardBundle } from "@/lib/store/dashboard-data";
import { isLocalMode, readDb, writeDb, newId } from "@/lib/store/local-db";
import { createServiceClient } from "@/lib/supabase/client";
import {
  cachedJsonCompletion,
  hasAnthropicKey,
} from "@/lib/pipeline/claude";
import type { AISuggestion } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const SYSTEM = `You are a product strategist. Given filtered customer intelligence stats, propose 3–5 actionable suggestions.
Return ONLY JSON:
{
  "suggestions": [
    {
      "priority": "Urgent"|"High"|"Medium",
      "headline": "short headline",
      "explanation": "one line",
      "linked_feature": "feature name from the list or closest match"
    }
  ]
}`;

function heuristicSuggestions(bundle: Awaited<ReturnType<typeof loadDashboardBundle>>): AISuggestion[] {
  const highChurn = bundle.churnSignals.filter((c) => c.churn_risk === "high").length;
  const critical = bundle.painPoints.filter((p) => p.severity >= 4).length;
  const topFeature = [...bundle.features].sort(
    (a, b) => b.impact_score - a.impact_score
  )[0];
  const topCluster = [...bundle.clusters].sort(
    (a, b) => (b.avg_severity ?? 0) - (a.avg_severity ?? 0)
  )[0];

  return [
    {
      priority: highChurn > 20 ? "Urgent" : "High",
      headline: `Address ${highChurn} high churn signals`,
      explanation:
        "Prioritize cancellation and competitor mentions before renewal windows.",
      linked_feature: topFeature?.feature_name ?? "Churn intervention playbook",
    },
    {
      priority: critical > 50 ? "Urgent" : "High",
      headline: `Triage ${critical} critical pain points`,
      explanation: "Severity 4–5 feedback is concentrated in a few product areas.",
      linked_feature: topCluster?.cluster_label
        ? `Improve ${topCluster.cluster_label}`
        : "Critical severity backlog",
    },
    {
      priority: "Medium",
      headline: "Ship highest-impact roadmap item first",
      explanation: topFeature
        ? `${topFeature.feature_name} leads impact at ${topFeature.impact_score}.`
        : "Run the features pipeline to populate impact scores.",
      linked_feature: topFeature?.feature_name ?? "Roadmap Now bucket",
    },
    {
      priority: "Medium",
      headline: "Compare themes across companies",
      explanation:
        "Flowdesk, Trackr, and NovaPulse show distinct dominant themes — filter by company to validate.",
      linked_feature: topCluster?.cluster_label ?? "Cross-company cluster review",
    },
  ];
}

async function readCache(filterKey: string): Promise<AISuggestion[] | null> {
  if (isLocalMode()) {
    const hit = readDb().ai_suggestions_cache.find(
      (c) => c.filter_key === filterKey
    );
    return hit?.suggestions ?? null;
  }
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("ai_suggestions_cache")
    .select("suggestions")
    .eq("filter_key", filterKey)
    .maybeSingle();
  const row = data as { suggestions?: AISuggestion[] } | null;
  return row?.suggestions ?? null;
}

async function writeCache(filterKey: string, suggestions: AISuggestion[]) {
  if (isLocalMode()) {
    const db = readDb();
    const idx = db.ai_suggestions_cache.findIndex(
      (c) => c.filter_key === filterKey
    );
    const row = {
      id: idx >= 0 ? db.ai_suggestions_cache[idx].id : newId(),
      filter_key: filterKey,
      suggestions,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (idx >= 0) db.ai_suggestions_cache[idx] = row;
    else db.ai_suggestions_cache.push(row);
    writeDb(db);
    return;
  }
  const supabase = createServiceClient();
  await supabase.from("ai_suggestions_cache").upsert(
    {
      filter_key: filterKey,
      suggestions,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "filter_key" }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const filterKey = String(body.filterKey || "default");
    const force = Boolean(body.force);

    if (!force) {
      const cached = await readCache(filterKey);
      if (cached?.length) {
        return NextResponse.json({ suggestions: cached, cached: true });
      }
    }

    const bundle = await loadDashboardBundle();
    let suggestions: AISuggestion[];

    if (hasAnthropicKey()) {
      const result = await cachedJsonCompletion({
        system: SYSTEM,
        user: JSON.stringify({
          filterKey,
          stats: {
            feedback: bundle.feedback.length,
            critical: bundle.painPoints.filter((p) => p.severity >= 4).length,
            highChurn: bundle.churnSignals.filter((c) => c.churn_risk === "high")
              .length,
            clusters: bundle.clusters.map((c) => c.cluster_label),
            features: bundle.features.map((f) => ({
              name: f.feature_name,
              impact: f.impact_score,
              effort: f.effort_estimate,
            })),
          },
        }),
        schema: AISuggestionSchema,
      });
      suggestions = result.data.suggestions;
    } else {
      suggestions = heuristicSuggestions(bundle);
    }

    await writeCache(filterKey, suggestions);
    return NextResponse.json({
      suggestions,
      cached: false,
      mode: hasAnthropicKey() ? "claude" : "heuristic",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
