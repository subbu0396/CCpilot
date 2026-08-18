/**
 * Shared G2 → feedback_items normalization for the MCP server.
 *
 * NOTE: G2 has no official MCP server as of 2026 — this custom MCP tool wraps
 * the G2 Partner API directly. Requires a G2 Partner API key. For the portfolio
 * demo, fall back to CSV import if no key is available via the `import_g2_csv`
 * fallback tool.
 *
 * Field mapping:
 *   attributes.title + attributes.body  → text
 *   attributes.rating                   → rating (convert from /10 to /5)
 *   attributes.submitted_at             → timestamp
 *   attributes.reviewer.title           → metadata.reviewer_role
 *   attributes.product_name             → metadata.product_name → company field
 */

export interface NormalizedFeedback {
  source: "g2";
  company: string;
  text: string;
  rating: number | null;
  timestamp: string;
  customer_id: string | null;
  metadata: Record<string, unknown>;
  external_id: string;
}

export function normalizeG2Rating(
  rating: number | null | undefined
): number | null {
  if (rating === null || rating === undefined || Number.isNaN(Number(rating))) {
    return null;
  }
  const n = Number(rating);
  if (n <= 5) return Math.round(n * 10) / 10;
  return Math.round((n / 2) * 10) / 10;
}

function toIso(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function normalizeG2ApiReview(review: {
  id?: string;
  attributes?: {
    title?: string;
    body?: string;
    rating?: number;
    submitted_at?: string;
    product_name?: string;
    reviewer?: { title?: string; name?: string };
  };
}, fallbackCompany?: string): NormalizedFeedback | null {
  const attrs = review.attributes ?? {};
  const title = (attrs.title || "").trim();
  const body = (attrs.body || "").trim();
  const text = [title, body].filter(Boolean).join("\n\n");
  if (!text) return null;

  const company = (attrs.product_name || fallbackCompany || "Unknown").trim();

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
    external_id: review.id
      ? `g2-${review.id}`
      : `g2-${text.slice(0, 48)}-${attrs.submitted_at}`,
  };
}

export function normalizeG2CsvRow(
  row: Record<string, string>,
  defaultCompany?: string
): NormalizedFeedback | null {
  const title = (row.title || "").trim();
  const body = (row.body || "").trim();
  const text = [title, body].filter(Boolean).join("\n\n");
  if (!text) return null;

  const company = (
    row.product_name ||
    row.company ||
    defaultCompany ||
    "Unknown"
  ).trim();

  const ratingRaw =
    row.rating === undefined || row.rating === ""
      ? null
      : Number(row.rating);

  const id = row.review_id || row.id;

  return {
    source: "g2",
    company,
    text,
    rating: normalizeG2Rating(ratingRaw),
    timestamp: toIso(row.submitted_at),
    customer_id: null,
    metadata: {
      reviewer_role: row.reviewer_title || row.reviewer_role || null,
      product_name: row.product_name || company,
    },
    external_id: id
      ? `g2-${id}`
      : `g2-${text.slice(0, 48)}-${row.submitted_at}`,
  };
}
