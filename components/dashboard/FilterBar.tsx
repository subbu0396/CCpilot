"use client";

import { useFilters, COMPANIES, SOURCES } from "@/lib/filters/context";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

export function FilterBar() {
  const { filters, setCompanies, setSources, setDateRange, setSeverity, resetFilters } =
    useFilters();

  function toggleCompany(c: string) {
    const next = filters.companies.includes(c)
      ? filters.companies.filter((x) => x !== c)
      : [...filters.companies, c];
    setCompanies(next);
  }

  function toggleSource(s: (typeof SOURCES)[number]) {
    const next = filters.sources.includes(s)
      ? filters.sources.filter((x) => x !== s)
      : [...filters.sources, s];
    setSources(next);
  }

  return (
    <div className="sticky top-0 z-30 border-b border-slate-200 bg-[#f7f5f1]/90 backdrop-blur-md">
      <div className="flex flex-wrap items-end gap-4 px-4 py-3 lg:px-6">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Company
          </p>
          <div className="flex flex-wrap gap-3">
            {COMPANIES.map((c) => (
              <label key={c} className="flex items-center gap-1.5 text-sm text-slate-700">
                <Checkbox
                  checked={filters.companies.includes(c)}
                  onCheckedChange={() => toggleCompany(c)}
                />
                {c}
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Source
          </p>
          <div className="flex flex-wrap gap-3">
            {SOURCES.map((s) => (
              <label key={s} className="flex items-center gap-1.5 text-sm capitalize text-slate-700">
                <Checkbox
                  checked={filters.sources.includes(s)}
                  onCheckedChange={() => toggleSource(s)}
                />
                {s === "playstore" ? "Play Store" : "Tickets"}
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-slate-500">From</Label>
            <Input
              type="date"
              className="h-8 w-[140px] bg-white"
              value={filters.dateFrom}
              onChange={(e) => setDateRange(e.target.value, filters.dateTo)}
            />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-slate-500">To</Label>
            <Input
              type="date"
              className="h-8 w-[140px] bg-white"
              value={filters.dateTo}
              onChange={(e) => setDateRange(filters.dateFrom, e.target.value)}
            />
          </div>
        </div>

        <div className="min-w-[180px] flex-1">
          <Label className="text-[11px] uppercase tracking-wider text-slate-500">
            Severity {filters.severityMin}–{filters.severityMax}
          </Label>
          <Slider
            className="mt-2"
            min={1}
            max={5}
            step={1}
            value={[filters.severityMin, filters.severityMax]}
            onValueChange={(v) => setSeverity(v[0], v[1])}
          />
        </div>

        <Button variant="outline" size="sm" onClick={resetFilters}>
          Reset
        </Button>
      </div>
    </div>
  );
}
