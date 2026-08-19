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
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { SectionHeader } from "./shared/SectionHeader";
import { StatGrid } from "./shared/StatGrid";
import { SEMANTIC } from "@/lib/dashboard/theme";

const SENTIMENT_COLORS = {
  positive: SEMANTIC.brand,
  neutral: SEMANTIC.neutral,
  negative: SEMANTIC.attention,
};

function severityDot(sev: number) {
  const colors = [
    SEMANTIC.neutral,
    SEMANTIC.neutralDark,
    SEMANTIC.attention,
    SEMANTIC.attention,
    SEMANTIC.critical,
  ];
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
    <section>
      <SectionHeader
        title="Pain Points"
        subtitle="Extracted severity, sentiment, and product area across filtered feedback"
      />

      <div className="mb-4">
        <StatGrid
          items={[
            { label: "Total feedback", value: stats.total },
            { label: "Critical (4–5)", value: stats.critical, tone: "critical" },
            { label: "Negative sentiment", value: stats.negative, tone: "attention" },
            { label: "Avg severity", value: stats.avg },
          ]}
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Sentiment</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Severity over time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={severityOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                  <YAxis domain={[1, 5]} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="avg" stroke={SEMANTIC.brand} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Product area</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={areaData} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="area" width={80} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill={SEMANTIC.attention} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
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

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 text-[11px] uppercase tracking-wide text-slate-500">
              <TableHead>Source</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Sev</TableHead>
              <TableHead>Sentiment</TableHead>
              <TableHead>Area</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Quote</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableRows.map((r) => {
              const open = expanded === r.feedback.id;
              return (
                <TableRow
                  key={r.feedback.id}
                  className="cursor-pointer"
                  onClick={() => setExpanded(open ? null : r.feedback.id)}
                >
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {r.feedback.source}
                    </Badge>
                  </TableCell>
                  <TableCell>{r.feedback.company}</TableCell>
                  <TableCell>{severityDot(r.painPoint?.severity ?? 0)}</TableCell>
                  <TableCell className="capitalize">{r.painPoint?.sentiment}</TableCell>
                  <TableCell>{r.painPoint?.product_area}</TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {r.feedback.timestamp.slice(0, 10)}
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal text-slate-700">
                    {open ? r.feedback.text : `${r.feedback.text.slice(0, 90)}${r.feedback.text.length > 90 ? "…" : ""}`}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </section>
  );
}
