"use client";

import { VIEWS, useView, type ViewId } from "./ViewProvider";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ViewCardNav({ headlines }: { headlines: Record<ViewId, string> }) {
  const { view, setView } = useView();

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {VIEWS.map((item) => {
        const isActive = view === item.id;
        const isAdmin = item.id === "admin";
        return (
          <button
            key={item.id}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => setView(item.id)}
            className="text-left"
          >
            <Card
              size="sm"
              className={cn(
                "h-full cursor-pointer transition hover:ring-[#2f6f6a]/40",
                isActive && "ring-2 ring-[#2f6f6a]",
                isAdmin && "bg-muted/60"
              )}
            >
              <CardHeader>
                <CardTitle className={cn(isAdmin && "text-slate-500")}>
                  {item.label}
                </CardTitle>
                <CardDescription
                  className={cn("line-clamp-2 text-xs", isAdmin && "text-slate-400")}
                >
                  {headlines[item.id]}
                </CardDescription>
              </CardHeader>
            </Card>
          </button>
        );
      })}
    </div>
  );
}
