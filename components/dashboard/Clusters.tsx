"use client";

import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useDashboard } from "./DashboardProvider";
import { useFilters } from "@/lib/filters/context";
import { applyFilters } from "@/lib/dashboard/utils";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { Cluster } from "@/lib/supabase/types";
import { SectionHeader } from "./shared/SectionHeader";
import { SEMANTIC } from "@/lib/dashboard/theme";

const SOURCE_COLORS = [SEMANTIC.brand, SEMANTIC.attention, SEMANTIC.neutral];

export function Clusters() {
  const { data } = useDashboard();
  const { filters } = useFilters();
  const [active, setActive] = useState<Cluster | null>(null);

  const filteredIds = useMemo(() => {
    if (!data) return new Set<string>();
    return new Set(
      applyFilters(data.feedback, data.painPoints, data.churnSignals, filters).map(
        (r) => r.feedback.id
      )
    );
  }, [data, filters]);

  const cards = useMemo(() => {
    if (!data) return [];
    return data.clusters
      .map((cluster) => {
        const memberIds = data.feedbackClusters
          .filter((m) => m.cluster_id === cluster.id)
          .map((m) => m.feedback_item_id)
          .filter((id) => filteredIds.has(id));
        const members = data.feedback.filter((f) => memberIds.includes(f.id));
        const mix = { playstore: 0, g2: 0, ticket: 0 };
        for (const m of members) mix[m.source] += 1;
        const areas = new Map<string, number>();
        for (const id of memberIds) {
          const pp = data.painPoints.find((p) => p.feedback_item_id === id);
          if (pp) areas.set(pp.product_area, (areas.get(pp.product_area) ?? 0) + 1);
        }
        const topArea =
          Array.from(areas.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
        const linkedFeatures = data.features.filter((f) => f.cluster_id === cluster.id);
        const companyBreakdown = new Map<string, number>();
        for (const m of members) {
          companyBreakdown.set(m.company, (companyBreakdown.get(m.company) ?? 0) + 1);
        }
        return {
          cluster,
          count: members.length,
          mix,
          topArea,
          linkedFeatures,
          quotes: cluster.representative_quotes,
          members,
          companyBreakdown: Array.from(companyBreakdown.entries()),
        };
      })
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [data, filteredIds]);

  const activeCard = cards.find((c) => c.cluster.id === active?.id);

  return (
    <section>
      <SectionHeader
        title="Clusters"
        subtitle="Theme groups from embedded pain-point summaries (k-means)"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ cluster, count, mix, topArea }) => {
          const pie = Object.entries(mix)
            .filter(([, v]) => v > 0)
            .map(([name, value]) => ({ name, value }));
          return (
            <button
              key={cluster.id}
              type="button"
              onClick={() => setActive(cluster)}
              className="rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 transition hover:ring-[#2f6f6a]/50"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-slate-900">{cluster.cluster_label}</h3>
                <Badge variant="outline">{count}</Badge>
              </div>
              <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-600">
                {cluster.cluster_summary}
              </p>
              <div className="mt-3 flex items-center justify-between">
                <div className="h-14 w-14">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pie} dataKey="value" innerRadius={12} outerRadius={22}>
                        {pie.map((_, i) => (
                          <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-right">
                  <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">
                    avg sev {cluster.avg_severity ?? "—"}
                  </Badge>
                  <p className="mt-1 text-[11px] text-slate-500">{topArea}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <Sheet open={Boolean(active)} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{active?.cluster_label}</SheetTitle>
            <SheetDescription>{active?.cluster_summary}</SheetDescription>
          </SheetHeader>
          {activeCard && (
            <div className="mt-6 space-y-5">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Representative quotes
                </p>
                <ul className="space-y-2">
                  {activeCard.quotes.map((q, i) => (
                    <li key={i} className="rounded-md bg-muted p-3 text-sm text-slate-700">
                      “{q}”
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Linked features
                </p>
                {activeCard.linkedFeatures.length ? (
                  <ul className="space-y-1">
                    {activeCard.linkedFeatures.map((f) => (
                      <li key={f.id} className="text-sm text-slate-800">
                        {f.feature_name}{" "}
                        <span className="text-xs text-slate-400">
                          ({f.effort_estimate}, impact {f.impact_score})
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">No features yet</p>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Company breakdown
                </p>
                <ul className="text-sm text-slate-700">
                  {activeCard.companyBreakdown.map(([c, n]) => (
                    <li key={c}>
                      {c}: {n}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Items ({activeCard.members.length})
                </p>
                <ul className="max-h-64 space-y-2 overflow-y-auto">
                  {activeCard.members.slice(0, 50).map((m) => (
                    <li key={m.id} className="border-b border-slate-100 pb-2 text-xs text-slate-600">
                      <Badge variant="outline" className="mr-1 capitalize">
                        {m.source}
                      </Badge>
                      {m.text.slice(0, 140)}
                      {m.text.length > 140 ? "…" : ""}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
