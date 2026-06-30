import type { NormalizedFeedbackItem } from "../../schema.js";
import {
  combineText,
  parseTimestamp,
  pickField,
  type ParserFn,
} from "../ingestion.js";

/**
 * Call transcript parser (Gong / Twilio / Chorus-style exports).
 *
 * LIVE INTEGRATION: Replace with Gong API (calls/transcripts) or
 * Twilio Voice recording + STT pipeline webhook ingestion.
 */
export const parseCallTranscripts: ParserFn = (raw) => {
  const rows = raw as Record<string, string>[];
  return rows.map((row): NormalizedFeedbackItem => {
    const externalId =
      pickField(row, ["call_id", "callid", "id", "recording_id"]) ??
      `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const transcript = pickField(row, [
      "transcript",
      "text",
      "content",
      "body",
      "Transcript",
    ]);
    const summary = pickField(row, ["summary", "call_summary", "notes"]);
    const customerId = pickField(row, [
      "customer_id",
      "contact_id",
      "account_id",
      "customer_email",
      "participant_email",
    ]);
    const timestamp = pickField(row, [
      "call_date",
      "started_at",
      "timestamp",
      "date",
      "Call Date",
    ]);
    const duration = pickField(row, ["duration", "duration_seconds", "length"]);
    const agent = pickField(row, ["agent", "rep", "agent_name"]);
    const sentiment = pickField(row, ["sentiment", "call_sentiment"]);

    return {
      external_id: String(externalId),
      source: "call",
      text: combineText(summary, transcript) || "(empty transcript)",
      timestamp: parseTimestamp(timestamp),
      customer_id: customerId,
      metadata: {
        duration_seconds: duration ? Number(duration) : null,
        agent: agent ?? null,
        call_sentiment: sentiment ?? null,
        has_transcript: Boolean(transcript),
      },
    };
  });
};
