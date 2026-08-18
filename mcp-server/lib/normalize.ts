/**
 * Shared G2 → feedback_items normalization for the MCP server.
 *
 * NOTE: G2 has no official MCP server as of 2026 — this custom MCP tool wraps
 * the G2 Partner API directly (v2, https://data.g2.com/api/v2). Requires a G2
 * Partner API key with the `products.reviews.read` scope AND a data
 * subscription granted for the target product — see mcp-server/README.md.
 * For the portfolio demo, fall back to CSV import if no key/subscription is
 * available via the `import_g2_csv` fallback tool.
 *
 * Field mapping (GET /api/v2/products/{product_id}/reviews, default serializer):
 *   attributes.title + flattened attributes.answers → text
 *   attributes.star_rating (already 1–5)             → rating
 *   attributes.submitted_at                          → timestamp
 *   attributes.product_name                          → company
 *   included user (via ?include=user)                → customer_id, metadata.reviewer_*
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
  // star_rating from the v2 API is already on a 1–5 scale.
  return Math.round(Number(rating) * 10) / 10;
}

function toIso(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** `answers` has no fixed shape ("Formatted question answers (pros, cons, etc.)") — flatten every string leaf. */
function flattenAnswers(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (value.trim()) out.push(value.trim());
  } else if (Array.isArray(value)) {
    for (const v of value) flattenAnswers(v, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) flattenAnswers(v, out);
  }
  return out;
}

interface G2IncludedUser {
  id?: string;
  type?: string;
  attributes?: {
    name?: string;
    first_name?: string;
    last_name?: string;
    industry?: string;
    company?: { title?: string } | null;
  };
}

export function normalizeG2ApiReview(
  review: {
    id?: string;
    attributes?: {
      title?: string;
      answers?: unknown;
      star_rating?: number;
      submitted_at?: string;
      product_name?: string;
      url?: string;
    };
    relationships?: {
      user?: { data?: { id?: string; type?: string } | null };
    };
  },
  fallbackCompany?: string,
  included?: G2IncludedUser[]
): NormalizedFeedback | null {
  const attrs = review.attributes ?? {};
  const title = (attrs.title || "").trim();
  const body = flattenAnswers(attrs.answers).join("\n\n");
  const text = [title, body].filter(Boolean).join("\n\n");
  if (!text) return null;

  const company = (attrs.product_name || fallbackCompany || "Unknown").trim();

  const userId = review.relationships?.user?.data?.id;
  const user = userId
    ? included?.find((i) => i.type === "users" && i.id === userId)
    : undefined;

  return {
    source: "g2",
    company,
    text,
    rating: normalizeG2Rating(attrs.star_rating),
    timestamp: toIso(attrs.submitted_at),
    customer_id: user?.attributes?.name ?? null,
    metadata: {
      reviewer_company: user?.attributes?.company?.title ?? null,
      reviewer_industry: user?.attributes?.industry ?? null,
      product_name: attrs.product_name ?? null,
      review_url: attrs.url ?? null,
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
