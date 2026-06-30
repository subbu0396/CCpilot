"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { IngestionResult } from "@/lib/schema";

const SOURCES = [
  {
    id: "ticket",
    label: "Support Tickets",
    columns: "id, subject, description, status, priority, tags, customer_email, created_at",
  },
  {
    id: "playstore",
    label: "Play Store Reviews",
    columns: "review_id, rating, content, user_id, review_date, app_version",
  },
  {
    id: "call",
    label: "Call Transcripts",
    columns: "call_id, transcript, summary, customer_email, call_date, duration_seconds, agent",
  },
  {
    id: "review",
    label: "Online Reviews (G2/Trustpilot)",
    columns: "review_id, title, content, rating, reviewer, review_date, platform",
  },
] as const;

type SourceId = (typeof SOURCES)[number]["id"];

export default function UploadPage() {
  const router = useRouter();
  const [activeSource, setActiveSource] = useState<SourceId>("ticket");
  const [preview, setPreview] = useState<Record<string, string>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<IngestionResult | null>(null);

  const active = SOURCES.find((s) => s.id === activeSource)!;

  async function handleFile(file: File) {
    setError(null);
    setPreview(null);
    setResult(null);
    setFileName(file.name);
    setSelectedFile(file);

    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext !== "csv" && ext !== "json") {
      setError("Upload a .csv or .json file");
      setSelectedFile(null);
      return;
    }

    try {
      const res = await fetch("/api/import/preview", {
        method: "POST",
        body: (() => {
          const fd = new FormData();
          fd.append("file", file);
          return fd;
        })(),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to parse file");
      }
      const data = await res.json();
      setPreview(data.rows as Record<string, string>[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse file");
      setSelectedFile(null);
    }
  }

  async function handleImport() {
    if (!selectedFile) return;

    setImporting(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("source", activeSource);

      const res = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Import failed");
      }

      setResult(data as IngestionResult);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Upload Feedback</h1>
        <p className="text-sm text-muted-foreground">
          Select a source, upload a CSV or JSON export, preview the data, then
          import into Supabase.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setActiveSource(s.id);
              setPreview(null);
              setFileName(null);
              setSelectedFile(null);
              setResult(null);
              setError(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm ${
              activeSource === s.id
                ? "bg-primary text-primary-foreground"
                : "border hover:bg-muted"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 text-sm">
        <p className="text-muted-foreground">
          Expected columns: <code className="text-xs">{active.columns}</code>
        </p>
      </div>

      <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 hover:bg-muted/30">
        <span className="text-sm font-medium">Drop CSV or JSON here</span>
        <span className="mt-1 text-xs text-muted-foreground">
          or click to browse (max 5 MB)
        </span>
        <input
          type="file"
          accept=".csv,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </label>

      {fileName && (
        <p className="text-sm">
          File: <strong>{fileName}</strong>
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <p className="font-medium">Import complete</p>
          <p className="mt-1">
            {result.imported} imported, {result.skipped} skipped
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs">
              {result.errors.slice(0, 5).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {preview && preview.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Preview (first 10 rows)</h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {Object.keys(preview[0]).map((h) => (
                    <th key={h} className="px-2 py-1 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className="border-t">
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="max-w-[200px] truncate px-2 py-1">
                        {String(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={importing || !selectedFile}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {importing ? "Importing…" : "Import to Supabase"}
          </button>
        </section>
      )}
    </div>
  );
}
