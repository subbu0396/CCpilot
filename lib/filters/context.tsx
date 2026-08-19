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
  setCompanies: (c: string[]) => void;
  setSources: (s: FeedbackSource[]) => void;
  setDateRange: (from: string, to: string) => void;
  setSeverity: (min: number, max: number) => void;
  resetFilters: () => void;
  filterKey: string;
}

const defaultFilters: FilterState = {
  companies: [...COMPANIES],
  sources: [...SOURCES],
  dateFrom: "2025-01-01",
  dateTo: "2026-12-31",
  severityMin: 1,
  severityMax: 5,
};

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  const setCompanies = useCallback((companies: string[]) => {
    setFilters((f) => ({
      ...f,
      companies: companies.length ? companies : [...COMPANIES],
    }));
  }, []);

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

  const resetFilters = useCallback(() => setFilters(defaultFilters), []);

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
      setCompanies,
      setSources,
      setDateRange,
      setSeverity,
      resetFilters,
      filterKey,
    }),
    [
      filters,
      setCompanies,
      setSources,
      setDateRange,
      setSeverity,
      resetFilters,
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
