import type { NormalizedFeedbackItem } from "@/lib/schema";
import {
  combineText,
  parseTimestamp,
  pickField,
  type ParserFn,
} from "../utils";

export const parseOnlineReviews: ParserFn = (raw) => {
  const rows = raw as Record<string, string>[];
  return rows.map((row): NormalizedFeedbackItem => {
    const externalId =
      pickField(row, ["review_id", "id", "Review ID"]) ??
      `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const title = pickField(row, ["title", "headline", "Review Title"]);
    const body = pickField(row, [
      "content",
      "review",
      "text",
      "body",
      "Review Content",
      "comments",
    ]);
    const ratingRaw = pickField(row, ["rating", "score", "stars", "Rating"]);
    const rating = ratingRaw ? Number(ratingRaw) : undefined;
    const customerId = pickField(row, [
      "reviewer",
      "author",
      "reviewer_name",
      "company",
      "Reviewer",
    ]);
    const timestamp = pickField(row, [
      "date",
      "review_date",
      "published_at",
      "timestamp",
      "Review Date",
    ]);
    const platform = pickField(row, ["platform", "source", "site"]);
    const verified = pickField(row, ["verified", "verified_purchase"]);

    return {
      external_id: String(externalId),
      source: "review",
      text: combineText(title, body) || "(no review text)",
      rating: rating !== undefined && !Number.isNaN(rating) ? rating : undefined,
      timestamp: parseTimestamp(timestamp),
      customer_id: customerId,
      metadata: {
        title: title ?? null,
        platform: platform ?? "unknown",
        verified: verified === "true" || verified === "1" || verified === "yes",
      },
    };
  });
};
