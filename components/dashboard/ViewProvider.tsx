"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export const VIEWS = [
  { id: "suggestions", label: "AI Suggestions" },
  { id: "pain-points", label: "Pain Points" },
  { id: "churn", label: "Churn Risk" },
  { id: "live-analysis", label: "Live Analysis" },
  { id: "clusters", label: "Clusters" },
  { id: "features", label: "Features" },
  { id: "roadmap", label: "Roadmap" },
  { id: "admin", label: "Admin / Pipeline" },
] as const;

export type ViewId = (typeof VIEWS)[number]["id"];

interface ViewContextValue {
  view: ViewId;
  setView: (view: ViewId) => void;
}

const ViewContext = createContext<ViewContextValue | null>(null);

export function ViewProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ViewId>("suggestions");
  return (
    <ViewContext.Provider value={{ view, setView }}>
      {children}
    </ViewContext.Provider>
  );
}

export function useView(): ViewContextValue {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error("useView must be used within a ViewProvider");
  return ctx;
}
