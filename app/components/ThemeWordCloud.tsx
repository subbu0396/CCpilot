"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WordCloud from "wordcloud";
import type { ClusterEnriched } from "@/lib/supabase/analysis-queries";

type ThemeWordCloudProps = {
  clusters: ClusterEnriched[];
  selectedId: string | null;
  onSelect: (clusterId: string | null) => void;
};

function severityHue(severity: number | null): string {
  if (severity == null) return "hsl(221, 70%, 48%)";
  if (severity >= 4) return "hsl(0, 72%, 48%)";
  if (severity >= 3) return "hsl(32, 90%, 45%)";
  return "hsl(221, 70%, 48%)";
}

export function ThemeWordCloud({
  clusters,
  selectedId,
  onSelect,
}: ThemeWordCloudProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<ClusterEnriched | null>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 360 });

  const labelToCluster = useMemo(() => {
    const map = new Map<string, ClusterEnriched>();
    for (const c of clusters) map.set(c.label.toLowerCase(), c);
    return map;
  }, [clusters]);

  const selectedCluster = clusters.find((c) => c.id === selectedId) ?? null;

  const resize = useCallback(() => {
    if (!containerRef.current) return;
    const { width } = containerRef.current.getBoundingClientRect();
    setDimensions({ width: Math.max(320, width), height: Math.min(420, Math.max(280, width * 0.55)) });
  }, []);

  useEffect(() => {
    resize();
    const ro = new ResizeObserver(resize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [resize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || clusters.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;

    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(dpr, dpr);

    const maxSize = Math.max(...clusters.map((c) => c.size), 1);
    const words: [string, number][] = clusters.map((c) => [
      c.label,
      Math.round(16 + (c.size / maxSize) * 44),
    ]);

    const colorMap = new Map(
      clusters.map((c) => [c.label, severityHue(c.avg_severity)])
    );

    WordCloud(canvas, {
      list: words,
      gridSize: Math.round((dimensions.width / 512) * 8),
      weightFactor: 1,
      fontFamily: "Inter, system-ui, sans-serif",
      fontWeight: "600",
      color: (word) => {
        const c = labelToCluster.get(String(word).toLowerCase());
        if (c?.id === selectedId) return "hsl(221, 83%, 40%)";
        return colorMap.get(String(word)) ?? "hsl(221, 70%, 48%)";
      },
      rotateRatio: 0.35,
      rotationSteps: 2,
      backgroundColor: "transparent",
      drawOutOfBound: false,
      shrinkToFit: true,
      click: (item) => {
        const label = item[0] as string;
        const cluster = labelToCluster.get(label.toLowerCase());
        if (cluster) {
          onSelect(selectedId === cluster.id ? null : cluster.id);
        }
      },
      hover: (item) => {
        if (!item) {
          setHovered(null);
          return;
        }
        const cluster = labelToCluster.get(String(item[0]).toLowerCase());
        setHovered(cluster ?? null);
      },
    });
  }, [clusters, dimensions, labelToCluster, onSelect, selectedId]);

  if (clusters.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No themes yet. Run analysis.</p>
    );
  }

  return (
    <div className="space-y-4">
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-slate-50 to-blue-50/40 p-2"
      >
        <canvas
          ref={canvasRef}
          className="mx-auto cursor-pointer"
          aria-label="Interactive theme word cloud"
        />

        {hovered && !selectedCluster && (
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-lg border bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
            <p className="text-sm font-semibold">{hovered.label}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{hovered.summary}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {hovered.size} reviews
              {hovered.avg_severity != null &&
                ` · severity ${Number(hovered.avg_severity).toFixed(1)}`}
            </p>
          </div>
        )}

        <p className="absolute right-3 top-2 text-[10px] text-muted-foreground">
          Click a theme to explore
        </p>
      </div>

      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-[hsl(0,72%,48%)]" />
          High severity
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-[hsl(32,90%,45%)]" />
          Medium
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-[hsl(221,70%,48%)]" />
          Lower
        </span>
        <span>· Size = review volume</span>
      </div>

      {selectedCluster && (
        <div className="rounded-xl border border-primary/30 bg-card p-4 shadow-md ring-1 ring-primary/10">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold">{selectedCluster.label}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{selectedCluster.summary}</p>
            </div>
            <div className="flex gap-2">
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs">
                {selectedCluster.size} reviews
              </span>
              {selectedCluster.avg_severity != null && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-800">
                  Severity {Number(selectedCluster.avg_severity).toFixed(1)}
                </span>
              )}
            </div>
          </div>

          <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Customer quotes
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(selectedCluster.member_quotes.length
              ? selectedCluster.member_quotes
              : selectedCluster.sample_quotes.map((t) => ({
                  text: t,
                  source: "—",
                  customer_id: null,
                }))
            ).map((q, i) => (
              <blockquote
                key={i}
                className="rounded-lg border-l-4 border-primary/50 bg-muted/30 px-3 py-2 text-sm italic"
              >
                &ldquo;{q.text.slice(0, 220)}
                {q.text.length > 220 ? "…" : ""}&rdquo;
                <footer className="mt-1 text-[10px] not-italic text-muted-foreground">
                  {q.source}
                  {q.customer_id ? ` · ${q.customer_id}` : ""}
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
