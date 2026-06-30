export const dynamic = "force-dynamic";

import { ChurnTrendChart } from "@/components/ChurnTrendChart";
import {
  getChurnByCustomer,
  getChurnTrend,
} from "@/lib/supabase/analysis-queries";

export default async function ChurnRiskPage() {
  let customers: Awaited<ReturnType<typeof getChurnByCustomer>> = [];
  let trend: Awaited<ReturnType<typeof getChurnTrend>> = [];
  let error: string | null = null;

  try {
    [customers, trend] = await Promise.all([
      getChurnByCustomer(),
      getChurnTrend(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load";
  }

  const highRisk = customers.filter((c) => c.max_risk === "high" || c.max_risk === "medium");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Churn Risk</h1>
        <p className="text-sm text-muted-foreground">
          Source-weighted risk scores aggregated by customer.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">{error}</div>
      )}

      <section className="rounded-lg border p-4">
        <h2 className="mb-4 text-lg font-semibold">Medium/high risk trend</h2>
        <ChurnTrendChart data={trend} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">High-risk customers & segments</h2>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left">Customer</th>
                <th className="px-4 py-2 text-left">Max risk</th>
                <th className="px-4 py-2 text-left">Score</th>
                <th className="px-4 py-2 text-left">Sources</th>
                <th className="px-4 py-2 text-left">Signals</th>
              </tr>
            </thead>
            <tbody>
              {highRisk.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No churn assessments yet.
                  </td>
                </tr>
              ) : (
                highRisk.map((c) => (
                  <tr key={c.customer_id} className="border-t">
                    <td className="px-4 py-2 font-medium">{c.customer_id}</td>
                    <td className="px-4 py-2 capitalize">
                      <span className={`rounded px-2 py-0.5 text-xs ${
                        c.max_risk === "high" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                      }`}>
                        {c.max_risk}
                      </span>
                    </td>
                    <td className="px-4 py-2">{c.score.toFixed(1)}</td>
                    <td className="px-4 py-2 capitalize">{c.sources.join(", ")}</td>
                    <td className="max-w-md px-4 py-2 text-xs text-muted-foreground">
                      {c.signals.join(" · ")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
