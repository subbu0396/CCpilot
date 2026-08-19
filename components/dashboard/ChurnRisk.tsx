"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useDashboard } from "./DashboardProvider";
import { useFilters } from "@/lib/filters/context";
import { applyFilters } from "@/lib/dashboard/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SectionHeader } from "./shared/SectionHeader";
import { StatGrid } from "./shared/StatGrid";
import { SEMANTIC } from "@/lib/dashboard/theme";

export function ChurnRisk() {
  const { data } = useDashboard();
  const { filters } = useFilters();
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!data) return [];
    return applyFilters(
      data.feedback,
      data.painPoints,
      data.churnSignals,
      filters
    ).filter((r) => r.churn);
  }, [data, filters]);

  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0, none: 0 };
    for (const r of rows) {
      const risk = r.churn?.churn_risk ?? "none";
      c[risk] += 1;
    }
    return c;
  }, [rows]);

  const byCompany = useMemo(() => {
    const map = new Map<string, { high: number; medium: number; low: number; none: number }>();
    for (const r of rows) {
      const cur = map.get(r.feedback.company) ?? { high: 0, medium: 0, low: 0, none: 0 };
      cur[r.churn!.churn_risk] += 1;
      map.set(r.feedback.company, cur);
    }
    return Array.from(map.entries()).map(([company, v]) => ({ company, ...v }));
  }, [rows]);

  const bySignal = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const t = r.churn?.signal_type ?? "none";
      map.set(t, (map.get(t) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const highRisk = useMemo(
    () =>
      rows
        .filter((r) => r.churn?.churn_risk === "high")
        .sort((a, b) => b.feedback.timestamp.localeCompare(a.feedback.timestamp))
        .slice(0, 40),
    [rows]
  );

  return (
    <section>
      <SectionHeader
        title="Churn Risk"
        subtitle="Weighted signals — tickets 2×, low ratings 1.5×, G2 1×"
      />

      <div className="mb-4">
        <StatGrid
          items={[
            { label: "High", value: counts.high, tone: "critical" },
            { label: "Medium", value: counts.medium, tone: "attention" },
            { label: "Low", value: counts.low, tone: "neutral" },
            { label: "None", value: counts.none, tone: "brand" },
          ]}
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Churn by company</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCompany}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="company" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="high" stackId="a" fill={SEMANTIC.critical} />
                  <Bar dataKey="medium" stackId="a" fill={SEMANTIC.attention} />
                  <Bar dataKey="low" stackId="a" fill={SEMANTIC.neutral} />
                  <Bar dataKey="none" stackId="a" fill={SEMANTIC.brand} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Signal type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bySignal} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="type" width={110} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill={SEMANTIC.brand} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="py-0">
        <div className="border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          High-risk items
        </div>
        <ul className="divide-y">
          {highRisk.map((r) => {
            const open = expanded === r.feedback.id;
            return (
              <li key={r.feedback.id}>
                <button
                  type="button"
                  className="w-full px-4 py-3 text-left hover:bg-muted"
                  onClick={() => setExpanded(open ? null : r.feedback.id)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                      {r.churn?.signal_type}
                    </Badge>
                    <Badge variant="outline" className="capitalize">
                      {r.feedback.source}
                    </Badge>
                    <span className="text-xs text-slate-500">{r.feedback.company}</span>
                    <span className="text-xs text-slate-400">
                      {r.feedback.timestamp.slice(0, 10)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-800">{r.churn?.churn_signal}</p>
                  {open && (
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                      {r.feedback.text}
                    </p>
                  )}
                </button>
              </li>
            );
          })}
          {!highRisk.length && (
            <li className="px-4 py-6 text-sm text-slate-500">No high-risk items for filters.</li>
          )}
        </ul>
      </Card>
    </section>
  );
}
