import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatTone = "default" | "critical" | "attention" | "brand" | "neutral";

const toneClass: Record<StatTone, string> = {
  default: "text-slate-900",
  critical: "text-red-700",
  attention: "text-[#c45c26]",
  brand: "text-[#2f6f6a]",
  neutral: "text-slate-500",
};

export interface StatItem {
  label: string;
  value: string | number;
  tone?: StatTone;
}

export function StatGrid({ items }: { items: StatItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} size="sm">
          <CardContent>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              {item.label}
            </p>
            <p
              className={cn(
                "mt-1 text-2xl font-semibold",
                toneClass[item.tone ?? "default"]
              )}
            >
              {item.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
