"use client";

import { useState } from "react";

const SOURCES = [
  {
    id: "ticket",
    label: "Support Tickets",
    tool: "import_support_tickets",
    columns: "id, subject, description, status, priority, tags, customer_email, created_at",
  },
  {
    id: "playstore",
    label: "Play Store Reviews",
    tool: "import_playstore_reviews",
    columns: "review_id, rating, content, user_id, review_date, app_version",
  },
  {
    id: "call",
    label: "Call Transcripts",
    tool: "import_call_transcripts",
    columns: "call_id, transcript, summary, customer_email, call_date, duration_seconds, agent",
  },
  {
    id: "review",
    label: "Online Reviews (G2/Trustpilot)",
    tool: "import_online_reviews",
    columns: "review_id, title, content, rating, reviewer, review_date, platform",
  },
] as const;

export default function UploadPage() {
  const [activeSource, setActiveSource] = useState<(typeof SOURCES)[number]["id"]>("ticket");
  const [preview, setPreview] = useState<Record<string, string>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const active = SOURCES.find((s) => s.id === activeSource)!;

  async function handleFile(file: File) {
    setError(null);
    setPreview(null);
    setFileName(file.name);

    const text = await file.text();
    const ext = file.name.split(".").pop()?.toLowerCase();

    try {
      if (ext === "json") {
        const parsed = JSON.parse(text);
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        setPreview(rows.slice(0, 10) as Record<string, string>[]);
      } else if (ext === "csv") {
        const lines = text.trim().split(/\r?\n/);
        const headers = lines[0].split(",").map((h) => h.trim());
        const rows = lines.slice(1, 11).map((line) => {
          const values = line.split(",");
          return Object.fromEntries(
            headers.map((h, i) => [h, (values[i] ?? "").trim()])
          );
        });
        setPreview(rows);
      } else {
        setError("Upload a .csv or .json file");
      }
    } catch {
      setError("Failed to parse file");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Upload Feedback</h1>
        <p className="text-sm text-muted-foreground">
          Preview CSV/JSON before committing. Actual import runs via the MCP server
          (not yet wired to this UI — use CLI for now).
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
        <p>
          <strong>MCP tool:</strong> <code>{active.tool}</code>
        </p>
        <p className="mt-1 text-muted-foreground">
          Expected columns: <code className="text-xs">{active.columns}</code>
        </p>
      </div>

      <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 hover:bg-muted/30">
        <span className="text-sm font-medium">Drop CSV or JSON here</span>
        <span className="mt-1 text-xs text-muted-foreground">
          or click to browse
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
        <p className="text-sm text-destructive">{error}</p>
      )}

      {preview && preview.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Preview (first 10 rows)</h2>
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
          <p className="mt-3 text-sm text-muted-foreground">
            To commit: run{" "}
            <code className="rounded bg-muted px-1">
              npm run import:tickets -- ../sample-data/support-tickets.csv
            </code>{" "}
            from <code>mcp-server/</code> (adjust tool per source).
          </p>
        </section>
      )}
    </div>
  );
}
