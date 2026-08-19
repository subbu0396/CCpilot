"use client";

import { useMemo, useState } from "react";
import { useDashboard } from "./DashboardProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import type { PipelineStage } from "@/lib/supabase/types";
import { adminFetch } from "@/lib/auth/admin-client";
import { SectionHeader } from "./shared/SectionHeader";

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

  async function syncZendesk() {
    setRunning(true);
    setStatus("Syncing Zendesk tickets…");
    try {
      const res = await adminFetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_zendesk" }),
      });
      const json = await res.json();
      setStatus(
        json.message ||
          `Zendesk sync: ${json.parsed ?? 0} tickets (${json.mode})`
      );
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <section>
      <SectionHeader
        title="Admin / Pipeline"
        subtitle="Ingest uploads, G2/Zendesk sync, and independently re-runnable stages"
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>CSV / JSON upload</CardTitle>
          </CardHeader>
          <CardContent>
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
              <Button onClick={() => void syncZendesk()} disabled={running}>
                Sync Zendesk
              </Button>
            </div>
            {preview && (
              <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-muted p-2 text-[10px] text-slate-600">
                {preview}
              </pre>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cluster controls</CardTitle>
          </CardHeader>
          <CardContent>
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

            <div className="mt-6 rounded-md bg-muted p-3">
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
          </CardContent>
        </Card>
      </div>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 text-[11px] uppercase tracking-wide text-slate-500">
              <TableHead>Stage</TableHead>
              <TableHead>Last run</TableHead>
              <TableHead>Records</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Re-run</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {STAGES.map(({ stage, label }) => {
              const job = latestByStage.get(stage);
              return (
                <TableRow key={stage}>
                  <TableCell className="font-medium text-slate-800">{label}</TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {job?.completed_at?.slice(0, 19) ?? job?.created_at?.slice(0, 19) ?? "—"}
                  </TableCell>
                  <TableCell>
                    {job
                      ? `${job.records_processed}/${job.records_total}`
                      : "—"}
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {status && (
        <p className="mt-3 text-sm text-slate-600" role="status">
          {status}
        </p>
      )}
    </section>
  );
}
