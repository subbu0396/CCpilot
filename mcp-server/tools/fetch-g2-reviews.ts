/**
 * fetch_g2_reviews — live G2 Partner API connector.
 *
 * NOTE: G2 has no official MCP server as of 2026 — this custom MCP tool wraps
 * the G2 Partner API directly. Requires a G2 Partner API key.
 * Auth: Authorization: Token token=<G2_API_KEY>
 * Endpoint: https://data.g2.com/api/v1/reviews
 */

import {
  normalizeG2ApiReview,
  type NormalizedFeedback,
} from "../lib/normalize.js";
import { getServiceClient, upsertG2Feedback } from "../lib/supabase.js";

export interface FetchG2Args {
  product_id: string;
  page?: number;
  per_page?: number;
  company?: string;
}

interface G2ListResponse {
  data?: Array<{
    id?: string;
    attributes?: Record<string, unknown>;
  }>;
  meta?: {
    total_count?: number;
    current_page?: number;
    total_pages?: number;
  };
  links?: { next?: string | null };
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

  const perPage = Math.min(Math.max(args.per_page ?? 100, 1), 100);
  let page = args.page ?? 1;
  const all: NormalizedFeedback[] = [];
  const errors: string[] = [];

  console.log(
    `[g2-mcp] Starting G2 fetch product_id=${args.product_id} per_page=${perPage}`
  );

  // Paginate until all reviews are fetched
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = new URL("https://data.g2.com/api/v1/reviews");
    url.searchParams.set("filter[product_id]", args.product_id);
    url.searchParams.set("page[number]", String(page));
    url.searchParams.set("page[size]", String(perPage));

    console.log(`[g2-mcp] Fetching page ${page}...`);

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: {
          Authorization: `Token token=${apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[g2-mcp] Network error on page ${page}: ${msg}`);
      errors.push(msg);
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
    console.log(`[g2-mcp] Page ${page}: ${rows.length} reviews`);

    for (const row of rows) {
      const normalized = normalizeG2ApiReview(
        row as Parameters<typeof normalizeG2ApiReview>[0],
        args.company
      );
      if (normalized) all.push(normalized);
    }

    const totalPages = json.meta?.total_pages;
    const hasNext = Boolean(json.links?.next) || (totalPages ? page < totalPages : false);

    if (rows.length === 0 || !hasNext) {
      break;
    }
    page += 1;
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
