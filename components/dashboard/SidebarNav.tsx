"use client";

const NAV = [
  { id: "suggestions", label: "AI Suggestions" },
  { id: "pain-points", label: "Pain Points" },
  { id: "churn", label: "Churn Risk" },
  { id: "clusters", label: "Clusters" },
  { id: "features", label: "Features" },
  { id: "roadmap", label: "Roadmap" },
  { id: "admin", label: "Admin / Pipeline" },
];

export function SidebarNav() {
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
          {NAV.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <p className="px-2 text-[10px] text-slate-500">Single-page copilot</p>
      </div>
    </aside>
  );
}
