"use client";

import { useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useDashboard } from "./DashboardProvider";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SectionHeader } from "./shared/SectionHeader";
import { SEMANTIC } from "@/lib/dashboard/theme";

const EFFORT_NUM: Record<string, number> = { XS: 1, S: 2, M: 3, L: 4, XL: 5 };

export function Features() {
  const { data } = useDashboard();

  const features = useMemo(() => {
    if (!data) return [];
    const clusterById = new Map(data.clusters.map((c) => [c.id, c]));
    return [...data.features]
      .sort((a, b) => b.impact_score - a.impact_score)
      .map((f) => ({
        ...f,
        effortNum: EFFORT_NUM[f.effort_estimate] ?? 3,
        clusterLabel: clusterById.get(f.cluster_id)?.cluster_label ?? "—",
        clusterSize: clusterById.get(f.cluster_id)?.item_count ?? 10,
      }));
  }, [data]);

  const scatter = features.map((f) => ({
    x: f.effortNum,
    y: f.impact_score,
    z: f.clusterSize,
    name: f.feature_name,
  }));

  return (
    <section>
      <SectionHeader
        title="Features"
        subtitle="Impact = cluster size × avg severity × churn weight"
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Impact vs Effort (bubble = cluster size)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Effort"
                  domain={[0.5, 5.5]}
                  ticks={[1, 2, 3, 4, 5]}
                  tickFormatter={(v) => ["", "XS", "S", "M", "L", "XL"][v] || String(v)}
                  tick={{ fontSize: 11 }}
                />
                <YAxis type="number" dataKey="y" name="Impact" tick={{ fontSize: 11 }} />
                <ZAxis type="number" dataKey="z" range={[60, 400]} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  formatter={(value, name) => [value, name]}
                  labelFormatter={(_, payload) =>
                    (payload?.[0]?.payload as { name?: string })?.name ?? ""
                  }
                />
                <Scatter data={scatter}>
                  {scatter.map((_, i) => (
                    <Cell
                      key={i}
                      fill={i % 2 === 0 ? SEMANTIC.brand : SEMANTIC.attention}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {features.map((f) => (
          <Card key={f.id}>
            <CardContent>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-slate-900">{f.feature_name}</h3>
                <Badge className="bg-[#2f6f6a]/15 text-[#2f6f6a] hover:bg-[#2f6f6a]/15">
                  impact {f.impact_score}
                </Badge>
                <Badge variant="outline">{f.effort_estimate}</Badge>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.description}</p>
              <p className="mt-3 text-[11px] font-medium text-slate-500">
                Cluster: {f.clusterLabel}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
