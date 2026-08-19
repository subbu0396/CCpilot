"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { useDashboard } from "./DashboardProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { roadmapToCsv, roadmapToMarkdown } from "@/lib/dashboard/export-roadmap";
import type { RoadmapBucket } from "@/lib/supabase/types";
import { adminFetch } from "@/lib/auth/admin-client";
import { SectionHeader } from "./shared/SectionHeader";

function DraggableCard({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id });
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab rounded-lg bg-card p-3 ring-1 ring-foreground/10 active:cursor-grabbing ${
        isDragging ? "opacity-70 ring-[#2f6f6a]" : ""
      }`}
    >
      {children}
    </div>
  );
}

function Column({
  id,
  title,
  children,
}: {
  id: RoadmapBucket;
  title: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[280px] rounded-xl p-3 ${
        isOver ? "bg-[#2f6f6a]/10" : "bg-muted"
      }`}
    >
      <h3 className="mb-3 font-[family-name:var(--font-display)] text-lg text-slate-800">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function Roadmap() {
  const { data, refresh } = useDashboard();
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const items = useMemo(() => {
    if (!data) return [];
    const featureById = new Map(data.features.map((f) => [f.id, f]));
    const clusterById = new Map(data.clusters.map((c) => [c.id, c]));
    return data.roadmap
      .map((r) => {
        const feature = featureById.get(r.feature_id);
        if (!feature) return null;
        return {
          ...r,
          feature,
          clusterLabel: clusterById.get(feature.cluster_id)?.cluster_label ?? "—",
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      bucket: RoadmapBucket;
      rationale: string;
      sort_order: number;
      manually_overridden: boolean;
      feature: { feature_name: string; impact_score: number; effort_estimate: string };
      clusterLabel: string;
    }>;
  }, [data]);

  async function onDragEnd(event: DragEndEvent) {
    const overId = event.over?.id;
    const activeId = String(event.active.id);
    if (!overId) return;
    const bucket = String(overId) as RoadmapBucket;
    if (!["now", "next", "later"].includes(bucket)) return;
    const item = items.find((i) => i.id === activeId);
    if (!item || item.bucket === bucket) return;

    setBusy(true);
    try {
      await adminFetch("/api/roadmap", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeId, bucket, sort_order: item.sort_order }),
      });
      await refresh();
    } catch {
      // Admin token prompt was cancelled, or the request failed — leave the
      // board showing its pre-drag state (refresh() was never called).
    } finally {
      setBusy(false);
    }
  }

  function exportRows() {
    return items.map((i) => ({
      bucket: i.bucket,
      feature_name: i.feature.feature_name,
      rationale: i.rationale,
      impact_score: i.feature.impact_score,
      effort_estimate: i.feature.effort_estimate,
    }));
  }

  function download(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section>
      <SectionHeader
        title="Roadmap"
        subtitle="Now / Next / Later — drag to override Claude placement"
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                download("roadmap.csv", roadmapToCsv(exportRows()), "text/csv")
              }
            >
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                download(
                  "roadmap.md",
                  roadmapToMarkdown(exportRows()),
                  "text/markdown"
                )
              }
            >
              Export Markdown
            </Button>
          </div>
        }
      />

      <DndContext sensors={sensors} onDragEnd={(e) => void onDragEnd(e)}>
        <div className={`grid gap-3 lg:grid-cols-3 ${busy ? "opacity-70" : ""}`}>
          {(["now", "next", "later"] as RoadmapBucket[]).map((bucket) => (
            <Column
              key={bucket}
              id={bucket}
              title={bucket.charAt(0).toUpperCase() + bucket.slice(1)}
            >
              {items
                .filter((i) => i.bucket === bucket)
                .map((i) => (
                  <DraggableCard key={i.id} id={i.id}>
                    <p className="text-sm font-semibold text-slate-900">
                      {i.feature.feature_name}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">{i.rationale}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant="outline">impact {i.feature.impact_score}</Badge>
                      <Badge variant="outline">{i.feature.effort_estimate}</Badge>
                      {i.manually_overridden && (
                        <Badge className="bg-[#c45c26]/15 text-[#c45c26] hover:bg-[#c45c26]/15">
                          overridden
                        </Badge>
                      )}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-400">{i.clusterLabel}</p>
                  </DraggableCard>
                ))}
            </Column>
          ))}
        </div>
      </DndContext>
    </section>
  );
}
