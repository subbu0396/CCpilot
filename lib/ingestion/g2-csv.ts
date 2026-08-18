import Papa from "papaparse";
import type { NormalizedFeedback } from "./schema";

/**
 * G2 CSV / Partner API field mapping (shared by MCP tools):
 *   attributes.title + attributes.body  → text
 *   attributes.rating                   → rating (/10 → /5)
 *   attributes.submitted_at             → timestamp
 *   attributes.reviewer.title           → metadata.reviewer_role
 *   attributes.product_name             → company
 *
 * NOTE: G2 has no official MCP server as of 2026 — the custom MCP tool wraps
 * the G2 Partner API directly. Requires a G2 Partner API key. For the portfolio
 * demo, fall back to CSV import via `import_g2_csv` if no key is available.
 */

export interface G2CsvRow {
  title?: string;
  body?: string;
  rating?: string | number;
  submitted_at?: string;
  reviewer_title?: string;
  reviewer_role?: string;
  product_name?: string;
  company?: string;
  id?: string;
  review_id?: string;
}

export interface G2ApiReview {
  id?: string;
  type?: string;
  attributes?: {
    title?: string;
    body?: string;
    rating?: number;
    submitted_at?: string;
    product_name?: string;
    reviewer?: { title?: string; name?: string };
  };
}

function toIso(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** Convert G2 0–10 (or already 0–5) rating to a 0–5 scale. */
export function normalizeG2Rating(rating: number | null | undefined): number | null {
  if (rating === null || rating === undefined || Number.isNaN(Number(rating))) {
    return null;
  }
  const n = Number(rating);
  if (n <= 5) return Math.round(n * 10) / 10;
  return Math.round((n / 2) * 10) / 10;
}

export function normalizeG2ApiReview(
  review: G2ApiReview,
  fallbackCompany?: string
): NormalizedFeedback | null {
  const attrs = review.attributes ?? {};
  const title = (attrs.title || "").trim();
  const body = (attrs.body || "").trim();
  const text = [title, body].filter(Boolean).join("\n\n");
  if (!text) return null;

  const company =
    (attrs.product_name || fallbackCompany || "Unknown").trim();

  return {
    source: "g2",
    company,
    text,
    rating: normalizeG2Rating(attrs.rating),
    timestamp: toIso(attrs.submitted_at),
    customer_id: attrs.reviewer?.name ?? null,
    metadata: {
      reviewer_role: attrs.reviewer?.title ?? null,
      product_name: attrs.product_name ?? null,
      g2_id: review.id ?? null,
    },
    external_id: review.id ? `g2-${review.id}` : `g2-${text.slice(0, 48)}-${attrs.submitted_at}`,
  };
}

export function parseG2CsvRows(
  rows: G2CsvRow[],
  defaultCompany?: string
): NormalizedFeedback[] {
  const out: NormalizedFeedback[] = [];
  for (const r of rows) {
    const title = (r.title || "").trim();
    const body = (r.body || "").trim();
    const text = [title, body].filter(Boolean).join("\n\n");
    if (!text) continue;

    const company = (
      r.product_name ||
      r.company ||
      defaultCompany ||
      "Unknown"
    ).trim();

    const ratingRaw =
      r.rating === undefined || r.rating === ""
        ? null
        : Number(r.rating);

    out.push({
      source: "g2",
      company,
      text,
      rating: normalizeG2Rating(ratingRaw),
      timestamp: toIso(r.submitted_at),
      customer_id: null,
      metadata: {
        reviewer_role: r.reviewer_title || r.reviewer_role || null,
        product_name: r.product_name || company,
      },
      external_id: r.review_id || r.id
        ? `g2-${r.review_id || r.id}`
        : `g2-${text.slice(0, 48)}-${r.submitted_at}`,
    });
  }
  return out;
}

export function parseG2Csv(
  csvText: string,
  defaultCompany?: string
): NormalizedFeedback[] {
  const parsed = Papa.parse<G2CsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  return parseG2CsvRows(parsed.data, defaultCompany);
}
