import Papa from "papaparse";
import type { NormalizedFeedback } from "./schema";

export interface PlayStoreRawRow {
  reviewId?: string;
  userName?: string;
  score?: string | number;
  content?: string;
  at?: string;
  company?: string;
  thumbsUpCount?: string | number;
  replyContent?: string;
}

function toIso(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function parsePlayStoreRows(
  rows: PlayStoreRawRow[],
  defaultCompany?: string
): NormalizedFeedback[] {
  return rows
    .filter((r) => (r.content ?? "").trim().length > 0)
    .map((r) => {
      const score =
        r.score === undefined || r.score === ""
          ? null
          : Number(r.score);
      return {
        source: "playstore" as const,
        company: (r.company || defaultCompany || "Unknown").trim(),
        text: String(r.content).trim(),
        rating: score !== null && !Number.isNaN(score) ? score : null,
        timestamp: toIso(r.at),
        customer_id: r.userName ? String(r.userName) : null,
        metadata: {
          review_id: r.reviewId ?? null,
          thumbs_up: r.thumbsUpCount ?? null,
          reply: r.replyContent ?? null,
        },
        external_id: r.reviewId ? String(r.reviewId) : `ps-${r.userName}-${r.at}-${String(r.content).slice(0, 40)}`,
      };
    });
}

export function parsePlayStoreCsv(
  csvText: string,
  defaultCompany?: string
): NormalizedFeedback[] {
  const parsed = Papa.parse<PlayStoreRawRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  return parsePlayStoreRows(parsed.data, defaultCompany);
}
