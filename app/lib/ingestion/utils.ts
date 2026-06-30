import type { NormalizedFeedbackItem } from "@/lib/schema";

export type ParserFn = (raw: unknown) => NormalizedFeedbackItem[];

export function pickField(
  row: Record<string, string>,
  candidates: string[]
): string | undefined {
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const normalizedCandidate = normalize(candidate);
    const match = keys.find((k) => normalize(k) === normalizedCandidate);
    if (match && row[match]) return row[match];
  }
  return undefined;
}

export function parseTimestamp(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

export function combineText(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join("\n\n").trim();
}
