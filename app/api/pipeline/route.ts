import { NextRequest, NextResponse } from "next/server";
import { runPainPoints } from "@/lib/pipeline/pain-points";
import { runChurn } from "@/lib/pipeline/churn";
import { runClustering } from "@/lib/pipeline/cluster";
import { runFeatures } from "@/lib/pipeline/features";
import { runRoadmap } from "@/lib/pipeline/roadmap";
import { listJobs } from "@/lib/pipeline/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const jobs = await listJobs();
  return NextResponse.json({ jobs });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const stage = body.stage as string;
    const company = body.company as string | undefined;
    const k = body.k ? Number(body.k) : undefined;

    let result;
    switch (stage) {
      case "pain_points":
        result = await runPainPoints({ company });
        break;
      case "churn":
        result = await runChurn({ company });
        break;
      case "cluster":
        result = await runClustering({ k });
        break;
      case "features":
        result = await runFeatures();
        break;
      case "roadmap":
        result = await runRoadmap();
        break;
      case "all":
        result = {
          pain_points: await runPainPoints({ company }),
          churn: await runChurn({ company }),
          cluster: await runClustering({ k }),
          features: await runFeatures(),
          roadmap: await runRoadmap(),
        };
        break;
      default:
        return NextResponse.json({ error: `Unknown stage: ${stage}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
