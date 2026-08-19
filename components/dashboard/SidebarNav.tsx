"use client";

import { VIEWS, useView } from "./ViewProvider";
import { Separator } from "@/components/ui/separator";

const MAIN_VIEWS = VIEWS.filter((v) => v.id !== "admin");
const ADMIN_VIEW = VIEWS.find((v) => v.id === "admin")!;

export function SidebarNav() {
  const { view, setView } = useView();

  return (
    <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-[#1a2332] text-[#f7f5f1] lg:block">
      <div className="sticky top-0 flex h-screen flex-col px-4 py-6">
        <div className="mb-8 px-2">
          <p className="font-[family-name:var(--font-display)] text-xl tracking-tight">
            CCPilot
          </p>
          <p className="mt-1 text-xs text-slate-400">Customer Intelligence</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {MAIN_VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => setView(item.id)}
              className={`rounded-md px-3 py-2 text-left text-sm transition ${
                view === item.id
                  ? "bg-white/10 text-white"
                  : "text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <Separator className="my-2 bg-white/10" />
        <button
          type="button"
          aria-current={view === ADMIN_VIEW.id ? "page" : undefined}
          onClick={() => setView(ADMIN_VIEW.id)}
          className={`rounded-md px-3 py-2 text-left text-xs transition ${
            view === ADMIN_VIEW.id
              ? "bg-white/10 text-white"
              : "text-slate-400 hover:bg-white/10 hover:text-white"
          }`}
        >
          {ADMIN_VIEW.label}
        </button>
        <p className="mt-2 px-2 text-[10px] text-slate-500">Single-page copilot</p>
      </div>
    </aside>
  );
}
