import type { FeedbackSource } from "@/lib/schema";
import { type ParserFn } from "../utils";
import { parseCallTranscripts } from "./call-transcripts";
import { parseOnlineReviews } from "./online-reviews";
import { parsePlaystoreReviews } from "./playstore";
import { parseSupportTickets } from "./support-tickets";

const PARSERS: Record<FeedbackSource, ParserFn> = {
  ticket: parseSupportTickets,
  playstore: parsePlaystoreReviews,
  call: parseCallTranscripts,
  review: parseOnlineReviews,
};

export function getParserForSource(source: FeedbackSource): ParserFn {
  return PARSERS[source];
}
