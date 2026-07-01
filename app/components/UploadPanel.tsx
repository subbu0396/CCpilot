"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { IngestionResult } from "@/lib/schema";

const SOURCES = [
  { id: "ticket", label: "Tickets", short: "Support tickets" },
  { id: "playstore", label: "Play Store", short: "App reviews" },
  { id: "call", label: "Calls", short: "Call transcripts" },
  { id: "review", label: "Reviews", short: "G2 / Trustpilot" },
] as const;

type SourceId = (typeof SOURCES)[number]["id"];

export function UploadPanel() {
  const router = useRouter();
  const [activeSource, setActiveSource] = useState<SourceId>("ticket");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<IngestionResult | null>(null);

  const processFile = useCallback(async (file: File) => {
    setError(null);
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
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/import/preview", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to parse file");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse file");
      setSelectedFile(null);
    }
  }, []);

  async function handleImport() {
    if (!selectedFile) return;
    setImporting(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("source", activeSource);

      const res = await fetch("/api/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");

      setResult(data as IngestionResult);
      setSelectedFile(null);
      setFileName(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Import feedback
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Drop CSV or JSON from any source, then run analysis.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setActiveSource(s.id);
              setResult(null);
              setError(null);
            }}
            className={`rounded-md px-2 py-2 text-left text-xs transition ${
              activeSource === s.id
                ? "bg-primary text-primary-foreground"
                : "border bg-card hover:bg-muted/50"
            }`}
          >
            <span className="block font-medium">{s.label}</span>
            <span
              className={`block text-[10px] ${
                activeSource === s.id ? "text-primary-foreground/80" : "text-muted-foreground"
              }`}
            >
              {s.short}
            </span>
          </button>
        ))}
      </div>

      <label
        className={`flex flex-1 min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 transition ${
          dragOver ? "border-primary bg-primary/5" : "hover:bg-muted/30"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) void processFile(f);
        }}
      >
        <span className="text-sm font-medium">Drop reviews here</span>
        <span className="mt-1 text-center text-xs text-muted-foreground">
          CSV or JSON · max 5 MB
        </span>
        <input
          type="file"
          accept=".csv,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void processFile(f);
          }}
        />
      </label>

      {fileName && (
        <p className="truncate text-xs">
          Ready: <strong>{fileName}</strong>
        </p>
      )}

      {selectedFile && (
        <button
          type="button"
          onClick={() => void handleImport()}
          disabled={importing}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {importing ? "Importing…" : "Import to database"}
        </button>
      )}

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {result && (
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900">
          {result.imported} imported · {result.skipped} skipped
        </p>
      )}
    </div>
  );
}
