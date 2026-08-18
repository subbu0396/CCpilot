"use client";

import { useMemo, useState } from "react";
import { useDashboard } from "./DashboardProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { PipelineStage } from "@/lib/supabase/types";
import { adminFetch } from "@/lib/auth/admin-client";

const STAGES: { stage: PipelineStage; label: string }[] = [
  { stage: "pain_points", label: "Pain point extraction" },
  { stage: "churn", label: "Churn risk scoring" },
  { stage: "cluster", label: "Embedding + clustering" },
  { stage: "features", label: "Feature extraction" },
  { stage: "roadmap", label: "Roadmap generation" },
];

export function Admin() {
  const { data, refresh } = useDashboard();
  const [k, setK] = useState(8);
  const [status, setStatus] = useState<string>("");
  const [preview, setPreview] = useState<string>("");
  const [running, setRunning] = useState(false);

  const latestByStage = useMemo(() => {
    const map = new Map<string, (typeof data extends null ? never : NonNullable<typeof data>["jobs"][number])>();
    for (const job of data?.jobs ?? []) {
      if (!map.has(job.stage)) map.set(job.stage, job);
    }
    return map;
  }, [data]);

  const tokenTotals = useMemo(() => {
    let cost = 0;
    let tokens = 0;
    for (const job of data?.jobs ?? []) {
      cost += Number(job.estimated_cost_usd ?? 0);
      const u = job.token_usage as {
        input_tokens?: number;
        output_tokens?: number;
      };
      tokens += (u.input_tokens ?? 0) + (u.output_tokens ?? 0);
    }
    return { cost, tokens };
  }, [data]);

  async function runStage(stage: string, extra?: Record<string, unknown>) {
    setRunning(true);
    setStatus(`Running ${stage}…`);
    try {
      const res = await adminFetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Pipeline failed");
      setStatus(`${stage} completed`);
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function onUpload(source: string, file: File | null) {
    if (!file) return;
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("source", source);
      form.set("preview", "1");
      const previewRes = await adminFetch("/api/ingest", { method: "POST", body: form });
      const previewJson = await previewRes.json();
      setPreview(
        `Preview ${source}: ${previewJson.count} rows\n` +
          JSON.stringify(previewJson.preview?.slice(0, 2) ?? [], null, 2)
      );

      form.delete("preview");
      const res = await adminFetch("/api/ingest", { method: "POST", body: form });
      const json = await res.json();
      setStatus(`Uploaded ${json.parsed ?? 0} ${source} rows (${json.mode})`);
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  async function syncG2() {
    setRunning(true);
    setStatus("Syncing G2 via MCP CSV fallback…");
    try {
      const res = await adminFetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_g2" }),
      });
      const json = await res.json();
      setStatus(json.message || "G2 sync done");
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <section id="admin" className="scroll-mt-24">
      <h2 className="font-[family-name:var(--font-display)] text-2xl text-slate-900">
        Admin / Pipeline
      </h2>
      <p className="mb-4 text-sm text-slate-500">
        Ingest uploads, G2 sync, and independently re-runnable stages
      </p>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">CSV / JSON upload</h3>
          <div className="space-y-3">
            {(
              [
                ["playstore", "Play Store CSV"],
                ["ticket", "Support tickets (Zendesk / Freshdesk)"],
              ] as const
            ).map(([source, label]) => (
              <div key={source}>
                <Label className="text-xs text-slate-500">{label}</Label>
                <Input
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  className="mt-1 bg-white"
                  disabled={running}
                  onChange={(e) => void onUpload(source, e.target.files?.[0] ?? null)}
                />
              </div>
            ))}
            <Button onClick={() => void syncG2()} disabled={running}>
              Sync G2 via MCP
            </Button>
          </div>
          {preview && (
            <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-slate-50 p-2 text-[10px] text-slate-600">
              {preview}
            </pre>
          )}
        </div>

        <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Cluster controls</h3>
          <Label className="text-xs text-slate-500">k = {k}</Label>
          <Slider
            className="mt-3"
            min={3}
            max={16}
            step={1}
            value={[k]}
            onValueChange={(v) => setK(v[0])}
          />
          <Button
            className="mt-4"
            variant="outline"
            disabled={running}
            onClick={() => void runStage("cluster", { k })}
          >
            Re-cluster
          </Button>

          <div className="mt-6 rounded-md bg-slate-50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Token usage tracker
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              ${tokenTotals.cost.toFixed(4)}
            </p>
            <p className="text-xs text-slate-500">
              ~{tokenTotals.tokens.toLocaleString()} tokens across recorded jobs
              {data?.mode === "local" ? " (heuristic mode when no API keys)" : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-slate-200/80">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="border-b bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2">Last run</th>
              <th className="px-3 py-2">Records</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Re-run</th>
            </tr>
          </thead>
          <tbody>
            {STAGES.map(({ stage, label }) => {
              const job = latestByStage.get(stage);
              return (
                <tr key={stage} className="border-b border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-800">{label}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {job?.completed_at?.slice(0, 19) ?? job?.created_at?.slice(0, 19) ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {job
                      ? `${job.records_processed}/${job.records_total}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {job ? (
                      <Badge
                        className={
                          job.status === "completed"
                            ? "bg-teal-100 text-teal-800 hover:bg-teal-100"
                            : job.status === "failed"
                              ? "bg-red-100 text-red-800 hover:bg-red-100"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-100"
                        }
                      >
                        {job.status}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={running}
                      onClick={() =>
                        void runStage(stage, stage === "cluster" ? { k } : undefined)
                      }
                    >
                      Re-run
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {status && (
        <p className="mt-3 text-sm text-slate-600" role="status">
          {status}
        </p>
      )}
    </section>
  );
}
