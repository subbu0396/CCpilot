"use client";

import { useCallback, useEffect, useState } from "react";
import { useFilters } from "@/lib/filters/context";
import type { AISuggestion } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw } from "lucide-react";
import { adminFetch } from "@/lib/auth/admin-client";
import { SectionHeader } from "./shared/SectionHeader";
import { cn } from "@/lib/utils";

const borderColor: Record<AISuggestion["priority"], string> = {
  Urgent: "border-l-red-500",
  High: "border-l-[#c45c26]",
  Medium: "border-l-[#2f6f6a]",
};

const badgeClass: Record<AISuggestion["priority"], string> = {
  Urgent: "bg-red-100 text-red-800",
  High: "bg-[#c45c26]/15 text-[#c45c26]",
  Medium: "bg-[#2f6f6a]/15 text-[#2f6f6a]",
};

export function AISuggestions() {
  const { filterKey } = useFilters();
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      try {
        const fetcher = force ? adminFetch : fetch;
        const res = await fetcher("/api/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filterKey, force }),
        });
        const json = await res.json();
        setSuggestions(json.suggestions ?? []);
      } catch {
        // Admin token prompt was cancelled, or the request failed — leave
        // whatever suggestions were already showing in place.
      } finally {
        setLoading(false);
      }
    },
    [filterKey]
  );

  useEffect(() => {
    const t = setTimeout(() => void load(false), 400);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <section>
      <SectionHeader
        title="AI Suggestions"
        subtitle="Claude-ranked actions for the current filter state"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(true)}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Regenerate
          </Button>
        }
      />

      <Card>
        <CardContent>
          {loading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {suggestions.map((s, i) => (
                <Card
                  key={`${s.headline}-${i}`}
                  className={cn("border-l-4", borderColor[s.priority])}
                >
                  <CardContent>
                    <Badge className={`${badgeClass[s.priority]} hover:${badgeClass[s.priority]}`}>
                      {s.priority}
                    </Badge>
                    <h3 className="mt-2 text-sm font-semibold text-slate-900">
                      {s.headline}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      {s.explanation}
                    </p>
                    <p className="mt-3 text-[11px] font-medium text-[#2f6f6a]">
                      → {s.linked_feature}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
