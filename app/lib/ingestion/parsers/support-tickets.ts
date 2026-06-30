import type { NormalizedFeedbackItem } from "@/lib/schema";
import {
  combineText,
  parseTimestamp,
  pickField,
  type ParserFn,
} from "../utils";

export const parseSupportTickets: ParserFn = (raw) => {
  const rows = raw as Record<string, string>[];
  return rows.map((row): NormalizedFeedbackItem => {
    const externalId =
      pickField(row, ["id", "ticketid", "ticket_id", "Ticket ID"]) ??
      `ticket-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const subject = pickField(row, ["subject", "title", "Subject"]);
    const body = pickField(row, [
      "description",
      "body",
      "content",
      "Description",
      "ticket_body",
    ]);
    const status = pickField(row, ["status", "Status"]);
    const priority = pickField(row, ["priority", "Priority"]);
    const tagsRaw = pickField(row, ["tags", "Tags", "tag_list"]);
    const customerId = pickField(row, [
      "customer_id",
      "requester_id",
      "customer_email",
      "requester_email",
      "email",
      "Customer Email",
    ]);
    const createdAt = pickField(row, [
      "created_at",
      "created",
      "Created At",
      "date",
    ]);

    const tags = tagsRaw
      ? tagsRaw.split(/[,;|]/).map((t) => t.trim()).filter(Boolean)
      : [];

    return {
      external_id: String(externalId),
      source: "ticket",
      text: combineText(subject, body) || "(empty ticket)",
      timestamp: parseTimestamp(createdAt),
      customer_id: customerId,
      metadata: {
        subject: subject ?? null,
        status: status ?? null,
        priority: priority ?? null,
        tags,
      },
    };
  });
};
