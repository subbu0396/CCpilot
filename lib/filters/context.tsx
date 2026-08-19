"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { FeedbackSource } from "@/lib/supabase/types";

export const COMPANIES = ["Flowdesk", "Trackr", "NovaPulse"] as const;
export const SOURCES: FeedbackSource[] = ["playstore", "ticket"];

export interface FilterState {
  companies: string[];
  sources: FeedbackSource[];
  dateFrom: string;
  dateTo: string;
  severityMin: number;
  severityMax: number;
}

interface FilterContextValue {
  filters: FilterState;
  /** Companies seen in the loaded data — drives the FilterBar checkbox list. Starts as the static demo list until real data registers itself. */
  knownCompanies: string[];
  setCompanies: (c: string[]) => void;
  setSources: (s: FeedbackSource[]) => void;
  setDateRange: (from: string, to: string) => void;
  setSeverity: (min: number, max: number) => void;
  resetFilters: () => void;
  /** Called by FilterBar once dashboard data loads, so companies outside the static demo list (e.g. a real Zendesk org name) aren't silently filtered out by default. */
  registerCompanies: (companies: string[]) => void;
  filterKey: string;
}

const defaultFilters: FilterState = {
  companies: [...COMPANIES],
  sources: [...SOURCES],
  dateFrom: "2000-01-01",
  dateTo: "2100-01-01",
  severityMin: 1,
  severityMax: 5,
};

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [knownCompanies, setKnownCompanies] = useState<string[]>([...COMPANIES]);
  const hasCustomizedCompanies = React.useRef(false);

  const setCompanies = useCallback((companies: string[]) => {
    hasCustomizedCompanies.current = true;
    setFilters((f) => ({
      ...f,
      companies: companies.length ? companies : knownCompanies,
    }));
  }, [knownCompanies]);

  const registerCompanies = useCallback((companies: string[]) => {
    setKnownCompanies((prev) => {
      const next = Array.from(new Set(companies)).sort();
      if (prev.length === next.length && prev.every((c, i) => c === next[i])) {
        return prev;
      }
      return next;
    });
  }, []);

  // Auto-select every real company the first time data loads, unless the
  // user has already touched the company checkboxes themselves.
  React.useEffect(() => {
    if (hasCustomizedCompanies.current) return;
    setFilters((f) => ({ ...f, companies: knownCompanies }));
  }, [knownCompanies]);

  const setSources = useCallback((sources: FeedbackSource[]) => {
    setFilters((f) => ({
      ...f,
      sources: sources.length ? sources : [...SOURCES],
    }));
  }, []);

  const setDateRange = useCallback((dateFrom: string, dateTo: string) => {
    setFilters((f) => ({ ...f, dateFrom, dateTo }));
  }, []);

  const setSeverity = useCallback((severityMin: number, severityMax: number) => {
    setFilters((f) => ({ ...f, severityMin, severityMax }));
  }, []);

  const resetFilters = useCallback(() => {
    hasCustomizedCompanies.current = false;
    setFilters({ ...defaultFilters, companies: knownCompanies });
  }, [knownCompanies]);

  const filterKey = useMemo(
    () =>
      [
        filters.companies.slice().sort().join(","),
        filters.sources.slice().sort().join(","),
        filters.dateFrom,
        filters.dateTo,
        filters.severityMin,
        filters.severityMax,
      ].join("|"),
    [filters]
  );

  const value = useMemo(
    () => ({
      filters,
      knownCompanies,
      setCompanies,
      setSources,
      setDateRange,
      setSeverity,
      resetFilters,
      registerCompanies,
      filterKey,
    }),
    [
      filters,
      knownCompanies,
      setCompanies,
      setSources,
      setDateRange,
      setSeverity,
      resetFilters,
      registerCompanies,
      filterKey,
    ]
  );

  return (
    <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilters must be used within FilterProvider");
  return ctx;
}
