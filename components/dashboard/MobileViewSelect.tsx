"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VIEWS, useView, type ViewId } from "./ViewProvider";

export function MobileViewSelect() {
  const { view, setView } = useView();

  return (
    <div className="px-4 pt-4 lg:hidden">
      <Select value={view} onValueChange={(v) => setView(v as ViewId)}>
        <SelectTrigger className="w-full bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VIEWS.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
