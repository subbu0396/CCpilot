export const dynamic = "force-dynamic";

import { ImpactEffortScatter } from "@/components/ImpactEffortScatter";
import { getFeatures } from "@/lib/supabase/analysis-queries";

export default async function FeaturesPage() {
  let features: Awaited<ReturnType<typeof getFeatures>> = [];
  let error: string | null = null;

  try {
    features = await getFeatures();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load";
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Feature Opportunities</h1>
        <p className="text-sm text-muted-foreground">
          Suggestions extracted from feedback clusters.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">{error}</div>
      )}

      <section className="rounded-lg border p-4">
        <h2 className="mb-4 text-lg font-semibold">Impact vs effort</h2>
        <ImpactEffortScatter
          features={features.map((f) => ({
            id: f.id as string,
            feature_name: f.feature_name as string,
            impact_estimate: f.impact_estimate as string,
            effort_size: f.effort_size as string,
          }))}
        />
      </section>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left">Feature</th>
              <th className="px-4 py-2 text-left">Description</th>
              <th className="px-4 py-2 text-left">Impact</th>
              <th className="px-4 py-2 text-left">Effort</th>
              <th className="px-4 py-2 text-left">Cluster</th>
            </tr>
          </thead>
          <tbody>
            {features.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No features yet. Run the analysis pipeline.
                </td>
              </tr>
            ) : (
              features.map((f) => {
                const cluster = f.feedback_clusters as { label: string } | null;
                return (
                  <tr key={f.id as string} className="border-t">
                    <td className="px-4 py-2 font-medium">{f.feature_name as string}</td>
                    <td className="max-w-md px-4 py-2 text-muted-foreground">
                      {f.description as string}
                    </td>
                    <td className="px-4 py-2 capitalize">{f.impact_estimate as string}</td>
                    <td className="px-4 py-2">{f.effort_size as string}</td>
                    <td className="px-4 py-2">{cluster?.label ?? "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
