"use client";

import { useCallback, useEffect, useState } from "react";
import { useFilters } from "@/lib/filters/context";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionHeader } from "./shared/SectionHeader";
import type { ChurnRisk } from "@/lib/supabase/types";

interface Briefing {
  company: string;
  churn: Record<ChurnRisk, number>;
  top_pain_points: { summary: string; severity: number; product_area: string }[];
  recent_escalations: { summary: string; timestamp: string }[];
  roadmap_items: {
    feature_name: string;
    bucket: string;
    jira_issue_key: string | null;
    jira_issue_url: string | null;
  }[];
}

export function CustomerHealth() {
  const { knownCompanies } = useFilters();
  const [company, setCompany] = useState<string>("");
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!company && knownCompanies.length) setCompany(knownCompanies[0]);
  }, [company, knownCompanies]);

  const load = useCallback(async (c: string) => {
    if (!c) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/customer-health?company=${encodeURIComponent(c)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setBriefing(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBriefing(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (company) void load(company);
  }, [company, load]);

  return (
    <section>
      <SectionHeader
        title="Customer Health"
        subtitle="Churn, pain points, escalations, and roadmap standing for one company"
        action={
          <Select value={company} onValueChange={setCompany}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue placeholder="Select company" />
            </SelectTrigger>
            <SelectContent>
              {knownCompanies.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {loading && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && briefing && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent>
              <h3 className="text-sm font-semibold text-slate-900">Churn risk</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                  high {briefing.churn.high}
                </Badge>
                <Badge className="bg-[#c45c26]/15 text-[#c45c26] hover:bg-[#c45c26]/15">
                  medium {briefing.churn.medium}
                </Badge>
                <Badge variant="outline">low {briefing.churn.low}</Badge>
                <Badge variant="outline">none {briefing.churn.none}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h3 className="text-sm font-semibold text-slate-900">Top pain points</h3>
              {briefing.top_pain_points.length ? (
                <ul className="mt-2 space-y-1.5">
                  {briefing.top_pain_points.map((p, i) => (
                    <li key={i} className="text-xs text-slate-600">
                      <Badge variant="outline" className="mr-1">
                        sev {p.severity}
                      </Badge>
                      {p.summary}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-slate-400">No pain points recorded.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h3 className="text-sm font-semibold text-slate-900">
                Recent escalations (30d)
              </h3>
              {briefing.recent_escalations.length ? (
                <ul className="mt-2 space-y-1.5">
                  {briefing.recent_escalations.map((e, i) => (
                    <li key={i} className="text-xs text-slate-600">
                      {e.summary}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-slate-400">None in the last 30 days.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h3 className="text-sm font-semibold text-slate-900">Roadmap standing</h3>
              {briefing.roadmap_items.length ? (
                <ul className="mt-2 space-y-1.5">
                  {briefing.roadmap_items.map((r, i) => (
                    <li key={i} className="text-xs text-slate-600">
                      <Badge variant="outline" className="mr-1">
                        {r.bucket}
                      </Badge>
                      {r.feature_name}
                      {r.jira_issue_key && (
                        <a
                          href={r.jira_issue_url ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-1 text-[#2f6f6a] underline"
                        >
                          {r.jira_issue_key}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-slate-400">No roadmap items linked yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
