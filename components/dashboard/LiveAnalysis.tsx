"use client";

import { useMemo, useState } from "react";
import { useDashboard } from "./DashboardProvider";
import { useFilters } from "@/lib/filters/context";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "./shared/SectionHeader";
import { StatGrid } from "./shared/StatGrid";
import type { CoreAnalysis, FeedbackItem } from "@/lib/supabase/types";

interface Row {
  feedback: FeedbackItem;
  analysis: CoreAnalysis;
}

const SENTIMENT_BADGE: Record<CoreAnalysis["sentiment"], string> = {
  POSITIVE: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  NEUTRAL: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  NEGATIVE: "bg-red-100 text-red-800 hover:bg-red-100",
};

function churnTone(score: number): string {
  if (score >= 0.75) return "text-red-700";
  if (score >= 0.4) return "text-[#c45c26]";
  return "text-[#2f6f6a]";
}

export function LiveAnalysis() {
  const { data } = useDashboard();
  const { filters } = useFilters();
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const fbById = new Map(data.feedback.map((f) => [f.id, f]));
    return data.coreAnalysis
      .map((analysis) => {
        const feedback = fbById.get(analysis.feedback_item_id);
        return feedback ? { feedback, analysis } : null;
      })
      .filter((r): r is Row => r !== null)
      .filter((r) => filters.companies.includes(r.feedback.company))
      .filter((r) => filters.sources.includes(r.feedback.source))
      .filter((r) => r.feedback.timestamp >= filters.dateFrom)
      .filter((r) => r.feedback.timestamp <= filters.dateTo + "T23:59:59.999Z")
      .sort((a, b) => b.analysis.churn_risk_score - a.analysis.churn_risk_score);
  }, [data, filters]);

  const stats = useMemo(() => {
    const escalated = rows.filter((r) => r.analysis.zendesk_priority_escalation).length;
    const negative = rows.filter((r) => r.analysis.sentiment === "NEGATIVE").length;
    const avgChurn = rows.length
      ? rows.reduce((sum, r) => sum + r.analysis.churn_risk_score, 0) / rows.length
      : 0;
    return { total: rows.length, escalated, negative, avgChurn };
  }, [rows]);

  return (
    <section>
      <SectionHeader
        title="Live Analysis"
        subtitle="Real-time Core Analysis Agent output — one row per Zendesk ticket or comment processed via webhook."
      />

      <div className="mb-4">
        <StatGrid
          items={[
            { label: "Analyzed", value: stats.total, tone: "default" },
            { label: "Escalated", value: stats.escalated, tone: "critical" },
            { label: "Negative sentiment", value: stats.negative, tone: "attention" },
            { label: "Avg churn score", value: stats.avgChurn.toFixed(2), tone: "brand" },
          ]}
        />
      </div>

      <Card className="py-0">
        <div className="border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Analyzed tickets
        </div>
        <ul className="divide-y">
          {rows.map((r) => {
            const open = expanded === r.feedback.id;
            return (
              <li key={r.feedback.id}>
                <button
                  type="button"
                  className="w-full px-4 py-3 text-left hover:bg-muted"
                  onClick={() => setExpanded(open ? null : r.feedback.id)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={SENTIMENT_BADGE[r.analysis.sentiment]}>
                      {r.analysis.sentiment}
                    </Badge>
                    <Badge variant="outline">{r.analysis.category}</Badge>
                    {r.analysis.zendesk_priority_escalation && (
                      <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                        Escalated
                      </Badge>
                    )}
                    <span
                      className={`text-xs font-semibold ${churnTone(r.analysis.churn_risk_score)}`}
                    >
                      churn {r.analysis.churn_risk_score.toFixed(2)}
                    </span>
                    <span className="text-xs text-slate-500">{r.feedback.company}</span>
                    <span className="text-xs text-slate-400">
                      {r.feedback.timestamp.slice(0, 10)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-800">
                    {r.analysis.primary_pain_point}
                  </p>
                  {open && (
                    <div className="mt-2 space-y-2">
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                        {r.feedback.text}
                      </p>
                      {r.analysis.key_quotes.length > 0 && (
                        <ul className="space-y-1">
                          {r.analysis.key_quotes.map((q, i) => (
                            <li
                              key={i}
                              className="border-l-2 border-slate-300 pl-2 text-xs italic text-slate-500"
                            >
                              &ldquo;{q}&rdquo;
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="text-xs text-slate-700">
                        <span className="font-medium">Recommendation: </span>
                        {r.analysis.actionable_recommendation}
                      </p>
                    </div>
                  )}
                </button>
              </li>
            );
          })}
          {!rows.length && (
            <li className="px-4 py-6 text-sm text-slate-500">
              No analyzed tickets for filters yet — trigger a ticket or comment in Zendesk to
              see it land here.
            </li>
          )}
        </ul>
      </Card>
    </section>
  );
}
