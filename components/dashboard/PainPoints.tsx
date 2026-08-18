"use client";

import { useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { useDashboard } from "./DashboardProvider";
import { useFilters } from "@/lib/filters/context";
import { applyFilters, weekKey } from "@/lib/dashboard/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const SENTIMENT_COLORS = {
  positive: "#2f6f6a",
  neutral: "#94a3b8",
  negative: "#c45c26",
};

function severityDot(sev: number) {
  const colors = ["#94a3b8", "#64748b", "#d4a017", "#c45c26", "#b91c1c"];
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ background: colors[Math.max(0, Math.min(4, sev - 1))] }}
      title={`Severity ${sev}`}
    />
  );
}

export function PainPoints() {
  const { data } = useDashboard();
  const { filters } = useFilters();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"date" | "severity">("severity");
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!data) return [];
    return applyFilters(
      data.feedback,
      data.painPoints,
      data.churnSignals,
      filters
    );
  }, [data, filters]);

  const withPain = rows.filter((r) => r.painPoint);

  const stats = useMemo(() => {
    const total = withPain.length;
    const critical = withPain.filter((r) => (r.painPoint?.severity ?? 0) >= 4).length;
    const negative = withPain.filter((r) => r.painPoint?.sentiment === "negative").length;
    const avg =
      total === 0
        ? 0
        : withPain.reduce((s, r) => s + (r.painPoint?.severity ?? 0), 0) / total;
    return { total, critical, negative, avg: avg.toFixed(1) };
  }, [withPain]);

  const sentimentData = useMemo(() => {
    const counts = { positive: 0, neutral: 0, negative: 0 };
    for (const r of withPain) {
      const s = r.painPoint?.sentiment;
      if (s) counts[s] += 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [withPain]);

  const severityOverTime = useMemo(() => {
    const map = new Map<string, { sum: number; n: number }>();
    for (const r of withPain) {
      const w = weekKey(r.feedback.timestamp);
      const cur = map.get(w) ?? { sum: 0, n: 0 };
      cur.sum += r.painPoint?.severity ?? 0;
      cur.n += 1;
      map.set(w, cur);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, v]) => ({ week, avg: Number((v.sum / v.n).toFixed(2)) }));
  }, [withPain]);

  const areaData = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of withPain) {
      const a = r.painPoint?.product_area ?? "Other";
      map.set(a, (map.get(a) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([area, count]) => ({ area, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [withPain]);

  const tableRows = useMemo(() => {
    let list = withPain.filter((r) => {
      if (!q) return true;
      const hay = `${r.feedback.text} ${r.painPoint?.product_area} ${r.feedback.company}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
    list = [...list].sort((a, b) => {
      if (sort === "severity") {
        return (b.painPoint?.severity ?? 0) - (a.painPoint?.severity ?? 0);
      }
      return b.feedback.timestamp.localeCompare(a.feedback.timestamp);
    });
    return list.slice(0, 100);
  }, [withPain, q, sort]);

  return (
    <section id="pain-points" className="scroll-mt-24">
      <h2 className="font-[family-name:var(--font-display)] text-2xl text-slate-900">
        Pain Points
      </h2>
      <p className="mb-4 text-sm text-slate-500">
        Extracted severity, sentiment, and product area across filtered feedback
      </p>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Total feedback", stats.total],
          ["Critical (4–5)", stats.critical],
          ["Negative sentiment", stats.negative],
          ["Avg severity", stats.avg],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200/80">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200/80">
          <p className="mb-2 text-xs font-medium text-slate-600">Sentiment</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sentimentData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70}>
                  {sentimentData.map((d) => (
                    <Cell
                      key={d.name}
                      fill={SENTIMENT_COLORS[d.name as keyof typeof SENTIMENT_COLORS]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200/80">
          <p className="mb-2 text-xs font-medium text-slate-600">Severity over time</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={severityOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis domain={[1, 5]} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="avg" stroke="#2f6f6a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200/80">
          <p className="mb-2 text-xs font-medium text-slate-600">Product area</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={areaData} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="area" width={80} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#c45c26" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        <Input
          placeholder="Search quotes, areas, companies…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm bg-white"
        />
        <select
          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
          value={sort}
          onChange={(e) => setSort(e.target.value as "date" | "severity")}
        >
          <option value="severity">Sort by severity</option>
          <option value="date">Sort by date</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-slate-200/80">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Sev</th>
              <th className="px-3 py-2">Sentiment</th>
              <th className="px-3 py-2">Area</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Quote</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((r) => {
              const open = expanded === r.feedback.id;
              return (
                <tr
                  key={r.feedback.id}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                  onClick={() => setExpanded(open ? null : r.feedback.id)}
                >
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="capitalize">
                      {r.feedback.source}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{r.feedback.company}</td>
                  <td className="px-3 py-2">{severityDot(r.painPoint?.severity ?? 0)}</td>
                  <td className="px-3 py-2 capitalize">{r.painPoint?.sentiment}</td>
                  <td className="px-3 py-2">{r.painPoint?.product_area}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">
                    {r.feedback.timestamp.slice(0, 10)}
                  </td>
                  <td className="px-3 py-2 max-w-md text-slate-700">
                    {open ? r.feedback.text : `${r.feedback.text.slice(0, 90)}${r.feedback.text.length > 90 ? "…" : ""}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
