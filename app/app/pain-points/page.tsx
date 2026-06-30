export const dynamic = "force-dynamic";

import Link from "next/link";
import { SentimentChart } from "@/components/SentimentChart";
import {
  getPainPoints,
  getSentimentDistribution,
} from "@/lib/supabase/analysis-queries";

const SOURCES = ["ticket", "playstore", "call", "review"];
const SENTIMENTS = ["positive", "neutral", "negative", "mixed"];

export default async function PainPointsPage({
  searchParams,
}: {
  searchParams: {
    source?: string;
    severity?: string;
    product_area?: string;
    sentiment?: string;
  };
}) {
  let rows: Awaited<ReturnType<typeof getPainPoints>> = [];
  let sentimentData: Awaited<ReturnType<typeof getSentimentDistribution>> = [];
  let error: string | null = null;

  try {
    [rows, sentimentData] = await Promise.all([
      getPainPoints({
        source: searchParams.source,
        severity: searchParams.severity
          ? Number(searchParams.severity)
          : undefined,
        product_area: searchParams.product_area,
        sentiment: searchParams.sentiment,
      }),
      getSentimentDistribution(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load";
  }

  const productAreas = Array.from(new Set(rows.map((r) => r.product_area))).sort();

  function filterUrl(key: string, value: string | undefined) {
    const params = new URLSearchParams();
    const current = { ...searchParams, [key]: value };
    for (const [k, v] of Object.entries(current)) {
      if (v) params.set(k, v);
    }
    const q = params.toString();
    return q ? `/pain-points?${q}` : "/pain-points";
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Pain Points</h1>
        <p className="text-sm text-muted-foreground">
          Extracted themes with severity, sentiment, and product area.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          {error}
        </div>
      )}

      <section className="rounded-lg border p-4">
        <h2 className="mb-4 text-lg font-semibold">Sentiment distribution</h2>
        <SentimentChart data={sentimentData} />
      </section>

      <section className="flex flex-wrap gap-2 text-sm">
        <span className="text-muted-foreground">Source:</span>
        <Link href={filterUrl("source", undefined)} className="underline-offset-2 hover:underline">All</Link>
        {SOURCES.map((s) => (
          <Link key={s} href={filterUrl("source", s)} className="capitalize underline-offset-2 hover:underline">
            {s}
          </Link>
        ))}
      </section>

      <section className="flex flex-wrap gap-2 text-sm">
        <span className="text-muted-foreground">Severity ≥:</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <Link key={n} href={filterUrl("severity", String(n))}>{n}+</Link>
        ))}
        <Link href={filterUrl("severity", undefined)}>Any</Link>
      </section>

      {productAreas.length > 0 && (
        <section className="flex flex-wrap gap-2 text-sm">
          <span className="text-muted-foreground">Area:</span>
          {productAreas.map((a) => (
            <Link key={a} href={filterUrl("product_area", a)}>{a}</Link>
          ))}
          <Link href={filterUrl("product_area", undefined)}>All</Link>
        </section>
      )}

      <section className="flex flex-wrap gap-2 text-sm">
        <span className="text-muted-foreground">Sentiment:</span>
        {SENTIMENTS.map((s) => (
          <Link key={s} href={filterUrl("sentiment", s)} className="capitalize">{s}</Link>
        ))}
        <Link href={filterUrl("sentiment", undefined)}>All</Link>
      </section>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left">Summary</th>
              <th className="px-4 py-2 text-left">Severity</th>
              <th className="px-4 py-2 text-left">Sentiment</th>
              <th className="px-4 py-2 text-left">Area</th>
              <th className="px-4 py-2 text-left">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No pain points yet. Run the analysis pipeline from Ingestion admin.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="max-w-md px-4 py-2">{row.summary}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                      row.severity >= 4 ? "bg-red-100 text-red-800" :
                      row.severity >= 3 ? "bg-amber-100 text-amber-800" :
                      "bg-muted"
                    }`}>
                      {row.severity}
                    </span>
                  </td>
                  <td className="px-4 py-2 capitalize">{row.sentiment}</td>
                  <td className="px-4 py-2">{row.product_area}</td>
                  <td className="px-4 py-2 capitalize">{row.source}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
