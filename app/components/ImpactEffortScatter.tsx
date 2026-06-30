"use client";

import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

const EFFORT_MAP: Record<string, number> = { S: 1, M: 2, L: 3, XL: 4 };
const IMPACT_MAP: Record<string, number> = { low: 1, medium: 2, high: 3 };

export function ImpactEffortScatter({
  features,
}: {
  features: {
    id: string;
    feature_name: string;
    impact_estimate: string;
    effort_size: string;
  }[];
}) {
  const data = features.map((f) => ({
    id: f.id,
    name: f.feature_name,
    impact: IMPACT_MAP[f.impact_estimate] ?? 2,
    effort: EFFORT_MAP[f.effort_size] ?? 2,
  }));

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No features yet. Run the analysis pipeline.</p>
    );
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid />
          <XAxis
            type="number"
            dataKey="effort"
            name="Effort"
            domain={[0.5, 4.5]}
            ticks={[1, 2, 3, 4]}
            tickFormatter={(v) => ["", "S", "M", "L", "XL"][v] ?? v}
          />
          <YAxis
            type="number"
            dataKey="impact"
            name="Impact"
            domain={[0.5, 3.5]}
            ticks={[1, 2, 3]}
            tickFormatter={(v) => ["", "Low", "Med", "High"][v] ?? v}
          />
          <ZAxis range={[80, 400]} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={data} fill="hsl(221.2 83.2% 53.3%)" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
