"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { adminFetch } from "@/lib/auth/admin-client";

interface ExplainResult {
  explanation: string;
  key_factors: string[];
}

export function ExplainDialog({
  roadmapId,
  featureName,
}: {
  roadmapId: string;
  featureName: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExplainResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next || result || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch("/api/roadmap/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roadmap_id: roadmapId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to explain roadmap item");
      setResult({ explanation: json.explanation, key_factors: json.key_factors ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => void onOpenChange(next)}>
      <Button
        variant="outline"
        size="sm"
        className="h-6 px-1.5 text-[10px]"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        Explain
      </Button>
      <DialogContent
        className="sm:max-w-md"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>{featureName}</DialogTitle>
          <DialogDescription>Why this item is placed where it is</DialogDescription>
        </DialogHeader>
        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        {result && (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-slate-700">{result.explanation}</p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600">
              {result.key_factors.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
