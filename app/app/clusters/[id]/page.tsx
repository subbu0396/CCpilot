export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getClusterDetail } from "@/lib/supabase/analysis-queries";

export default async function ClusterDetailPage({
  params,
}: {
  params: { id: string };
}) {
  let data: Awaited<ReturnType<typeof getClusterDetail>> | null = null;
  let error: string | null = null;

  try {
    data = await getClusterDetail(params.id);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load";
  }

  if (!data && !error) notFound();

  const cluster = data?.cluster;
  const quotes = (cluster?.sample_quotes as string[]) ?? [];

  return (
    <div className="space-y-6">
      <Link href="/clusters" className="text-sm text-primary hover:underline">
        ← Back to clusters
      </Link>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">{error}</div>
      )}

      {cluster && (
        <>
          <div>
            <h1 className="text-2xl font-bold">{cluster.label as string}</h1>
            <p className="mt-2 text-muted-foreground">{cluster.summary as string}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {cluster.size} items · Avg severity{" "}
              {cluster.avg_severity != null
                ? Number(cluster.avg_severity).toFixed(1)
                : "—"}
            </p>
          </div>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Sample quotes</h2>
            <ul className="space-y-3">
              {quotes.map((q, i) => (
                <li key={i} className="rounded-lg border bg-muted/30 p-4 text-sm italic">
                  &ldquo;{q}&rdquo;
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">All members</h2>
            <ul className="space-y-2">
              {(data?.members ?? []).map((m) => (
                <li key={m.feedback_item_id} className="rounded border p-3 text-sm">
                  <span className="mr-2 capitalize text-xs text-muted-foreground">
                    {m.source}
                  </span>
                  {m.text.slice(0, 400)}
                  {m.text.length > 400 ? "…" : ""}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
