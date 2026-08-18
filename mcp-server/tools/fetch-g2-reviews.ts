/**
 * fetch_g2_reviews — live G2 Partner API connector.
 *
 * NOTE: G2 has no official MCP server as of 2026 — this custom MCP tool wraps
 * the G2 Partner API directly.
 * Auth: Authorization: Bearer <G2_API_KEY> (AccountAPIToken, HTTP bearer scheme)
 * Endpoint: GET https://data.g2.com/api/v2/products/{product_id}/reviews
 * Requires the `products.reviews.read` scope AND a data subscription granted
 * for the target product — a valid key with no subscription returns 403
 * ("You do not have access to that resource").
 * Pagination is cursor-based (page[size] + page[after]/links.next), not
 * page-number based.
 */

import {
  normalizeG2ApiReview,
  type NormalizedFeedback,
} from "../lib/normalize.js";
import { getServiceClient, upsertG2Feedback } from "../lib/supabase.js";

export interface FetchG2Args {
  product_id: string;
  page?: number; // unused — retained for backward-compatible tool input, cursor pagination is automatic
  per_page?: number;
  company?: string;
}

interface G2ReviewResource {
  id?: string;
  type?: string;
  attributes?: Record<string, unknown>;
  relationships?: { user?: { data?: { id?: string; type?: string } | null } };
}

interface G2ListResponse {
  data?: G2ReviewResource[];
  included?: Array<{ id?: string; type?: string; attributes?: Record<string, unknown> }>;
  links?: { next?: string | null };
  errors?: Array<{ status?: string; title?: string }>;
}

export async function fetchG2Reviews(
  args: FetchG2Args
): Promise<{
  ok: boolean;
  fetched: number;
  inserted: number;
  errors: string[];
  message: string;
}> {
  const apiKey = process.env.G2_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      fetched: 0,
      inserted: 0,
      errors: ["G2_API_KEY is not set"],
      message:
        "No G2_API_KEY — use import_g2_csv fallback for the portfolio demo.",
    };
  }

  const perPage = Math.min(Math.max(args.per_page ?? 100, 1), 250);
  const all: NormalizedFeedback[] = [];
  const errors: string[] = [];

  let url: string | null = (() => {
    const u = new URL(
      `https://data.g2.com/api/v2/products/${encodeURIComponent(args.product_id)}/reviews`
    );
    u.searchParams.set("page[size]", String(perPage));
    u.searchParams.set("include", "user");
    return u.toString();
  })();

  console.log(
    `[g2-mcp] Starting G2 fetch product_id=${args.product_id} per_page=${perPage}`
  );

  while (url) {
    console.log(`[g2-mcp] Fetching ${url}`);

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/vnd.api+json",
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[g2-mcp] Network error: ${msg}`);
      errors.push(msg);
      break;
    }

    if (res.status === 403) {
      errors.push(
        "G2 API 403: token is valid but has no data subscription/access for this product. " +
          "Request a data subscription for this product via the G2 partner portal, then retry."
      );
      break;
    }

    if (!res.ok) {
      const body = await res.text();
      const msg = `G2 API ${res.status}: ${body.slice(0, 500)}`;
      console.error(`[g2-mcp] ${msg}`);
      errors.push(msg);
      break;
    }

    const json = (await res.json()) as G2ListResponse;
    const rows = json.data ?? [];
    const included = (json.included ?? []).filter((i) => i.type === "users");
    console.log(`[g2-mcp] Page: ${rows.length} reviews`);

    for (const row of rows) {
      const normalized = normalizeG2ApiReview(row, args.company, included);
      if (normalized) all.push(normalized);
    }

    url = json.links?.next ?? null;
  }

  console.log(`[g2-mcp] Normalized ${all.length} reviews — writing to Supabase`);

  const supabase = getServiceClient();
  const { inserted, errors: upsertErrors } = await upsertG2Feedback(
    supabase,
    all
  );
  errors.push(...upsertErrors);

  return {
    ok: errors.length === 0,
    fetched: all.length,
    inserted,
    errors,
    message: `Fetched ${all.length} G2 reviews, upserted ${inserted}`,
  };
}
