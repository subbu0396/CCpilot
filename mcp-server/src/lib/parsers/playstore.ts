import type { NormalizedFeedbackItem } from "../../schema.js";
import {
  combineText,
  parseTimestamp,
  pickField,
  type ParserFn,
} from "../ingestion.js";

/**
 * Google Play Store review export parser.
 *
 * LIVE INTEGRATION: Replace with `google-play-scraper` or the
 * Google Play Developer API (reviews.list) using service account auth.
 */
export const parsePlaystoreReviews: ParserFn = (raw) => {
  const rows = raw as Record<string, string>[];
  return rows.map((row): NormalizedFeedbackItem => {
    const externalId =
      pickField(row, ["reviewid", "review_id", "id", "Review ID"]) ??
      `playstore-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const text = pickField(row, [
      "content",
      "review",
      "text",
      "body",
      "comment",
      "Review Text",
    ]);
    const ratingRaw = pickField(row, ["rating", "score", "stars", "Rating"]);
    const rating = ratingRaw ? Number(ratingRaw) : undefined;
    const customerId = pickField(row, [
      "userid",
      "user_id",
      "author",
      "reviewer",
      "User Name",
    ]);
    const timestamp = pickField(row, [
      "at",
      "date",
      "timestamp",
      "review_date",
      "Review Submit Date and Time",
    ]);
    const appVersion = pickField(row, ["appversion", "app_version", "version"]);
    const reply = pickField(row, ["replycontent", "developer_reply", "reply"]);

    return {
      external_id: String(externalId),
      source: "playstore",
      text: text ?? "(no review text)",
      rating: rating !== undefined && !Number.isNaN(rating) ? rating : undefined,
      timestamp: parseTimestamp(timestamp),
      customer_id: customerId,
      metadata: {
        app_version: appVersion ?? null,
        developer_reply: reply ?? null,
      },
    };
  });
};
