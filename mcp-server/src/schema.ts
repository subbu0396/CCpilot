import { z } from "zod";

export const FeedbackSource = z.enum([
  "playstore",
  "call",
  "ticket",
  "review",
]);
export type FeedbackSource = z.infer<typeof FeedbackSource>;

export const NormalizedFeedbackItem = z.object({
  id: z.string().uuid().optional(),
  external_id: z.string(),
  source: FeedbackSource,
  text: z.string().min(1),
  rating: z.number().min(0).max(5).optional(),
  timestamp: z.string().datetime({ offset: true }),
  customer_id: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type NormalizedFeedbackItem = z.infer<typeof NormalizedFeedbackItem>;

export const IngestionResult = z.object({
  source: FeedbackSource,
  imported: z.number(),
  skipped: z.number(),
  errors: z.array(z.string()),
  run_id: z.string().uuid(),
});
export type IngestionResult = z.infer<typeof IngestionResult>;
