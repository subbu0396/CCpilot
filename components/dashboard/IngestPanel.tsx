"use client";

import { useState } from "react";
import { useDashboard } from "./DashboardProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { adminFetch } from "@/lib/auth/admin-client";

/** Always-visible ingest controls, shown in the sidebar regardless of the active view. */
export function IngestPanel() {
  const { refresh } = useDashboard();
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [analyze, setAnalyze] = useState(false);

  async function onUpload(source: string, file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("source", source);
      form.set("preview", "1");
      const previewRes = await adminFetch("/api/ingest", { method: "POST", body: form });
      const previewJson = await previewRes.json();

      form.delete("preview");
      const res = await adminFetch("/api/ingest", { method: "POST", body: form });
      const json = await res.json();
      setStatus(`Uploaded ${json.parsed ?? previewJson.count ?? 0} ${source} rows`);
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function syncZendesk() {
    setBusy(true);
    setStatus("Syncing Zendesk…");
    try {
      const res = await adminFetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_zendesk", analyze }),
      });
      const json = await res.json();
      const parts = [`Zendesk sync: ${json.parsed ?? 0} tickets`];
      if (typeof json.analyzed === "number") parts.push(`${json.analyzed} analyzed`);
      if (typeof json.escalated === "number" && json.escalated > 0) parts.push(`${json.escalated} escalated`);
      if (json.analysis_skipped) parts.push(json.analysis_skipped);
      setStatus(json.message || parts.join(", "));
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-white/10 pt-4">
      <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Ingest
      </p>
      <div className="space-y-2.5 px-2">
        <div>
          <Label className="text-[10px] text-slate-400">Play Store CSV</Label>
          <Input
            type="file"
            accept=".csv,.json,text/csv,application/json"
            disabled={busy}
            onChange={(e) => void onUpload("playstore", e.target.files?.[0] ?? null)}
            className="mt-1 h-8 bg-white text-[11px] file:text-[11px]"
          />
        </div>
        <div>
          <Label className="text-[10px] text-slate-400">Tickets CSV</Label>
          <Input
            type="file"
            accept=".csv,.json,text/csv,application/json"
            disabled={busy}
            onChange={(e) => void onUpload("ticket", e.target.files?.[0] ?? null)}
            className="mt-1 h-8 bg-white text-[11px] file:text-[11px]"
          />
        </div>
        <div className="flex items-center gap-1.5 pt-1">
          <Checkbox
            id="analyze-on-sync"
            checked={analyze}
            disabled={busy}
            onCheckedChange={(v) => setAnalyze(v === true)}
          />
          <Label htmlFor="analyze-on-sync" className="text-[10px] font-normal text-slate-400">
            Also analyze new tickets
          </Label>
        </div>
        <div className="pt-1">
          <Button
            size="sm"
            variant="secondary"
            className="w-full px-1.5 text-[11px]"
            disabled={busy}
            onClick={() => void syncZendesk()}
          >
            Sync Zendesk
          </Button>
        </div>
        {status && (
          <p className="pt-1 text-[10px] leading-snug text-slate-400" role="status">
            {status}
          </p>
        )}
      </div>
    </div>
  );
}
