/**
 * Run pipeline stages. Examples:
 *   npx tsx scripts/run-pipeline.ts
 *   npx tsx scripts/run-pipeline.ts --stage pain_points --company Flowdesk
 *   npx tsx scripts/run-pipeline.ts --stage cluster --k 8
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { runPainPoints } from "../lib/pipeline/pain-points";
import { runChurn } from "../lib/pipeline/churn";
import { runClustering } from "../lib/pipeline/cluster";
import { runFeatures } from "../lib/pipeline/features";
import { runRoadmap } from "../lib/pipeline/roadmap";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const stage = arg("stage");
  const company = arg("company");
  const k = arg("k") ? Number(arg("k")) : undefined;
  const limit = arg("limit") ? Number(arg("limit")) : undefined;

  console.log(
    `Pipeline starting (ANTHROPIC=${Boolean(process.env.ANTHROPIC_API_KEY)}, VOYAGE=${Boolean(process.env.VOYAGE_API_KEY)})`
  );

  if (!stage || stage === "pain_points") {
    const r = await runPainPoints({ company, limit });
    console.log("pain_points:", r);
    if (stage) return;
  }
  if (!stage || stage === "churn") {
    const r = await runChurn({ company, limit });
    console.log("churn:", r);
    if (stage) return;
  }
  if (!stage || stage === "cluster") {
    const r = await runClustering({ k });
    console.log("cluster:", r);
    if (stage) return;
  }
  if (!stage || stage === "features") {
    const r = await runFeatures();
    console.log("features:", r);
    if (stage) return;
  }
  if (!stage || stage === "roadmap") {
    const r = await runRoadmap();
    console.log("roadmap:", r);
    if (stage) return;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
