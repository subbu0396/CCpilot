import Papa from "papaparse";
import type { NormalizedFeedback } from "./schema";

/** Zendesk-style export columns */
export interface ZendeskRow {
  id?: string;
  subject?: string;
  description?: string;
  body?: string;
  status?: string;
  tags?: string;
  requester_id?: string;
  created_at?: string;
  company?: string;
  priority?: string;
}

/** Freshdesk-style export columns */
export interface FreshdeskRow {
  "Ticket Id"?: string;
  "Ticket ID"?: string;
  Subject?: string;
  Description?: string;
  Status?: string;
  Tags?: string;
  "Requester ID"?: string;
  "Created Time"?: string;
  company?: string;
  Priority?: string;
}

function toIso(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function isFreshdesk(row: Record<string, unknown>): boolean {
  return (
    "Ticket Id" in row ||
    "Ticket ID" in row ||
    "Created Time" in row ||
    "Subject" in row
  );
}

export function parseTicketRows(
  rows: Record<string, unknown>[],
  defaultCompany?: string
): NormalizedFeedback[] {
  const out: NormalizedFeedback[] = [];
  for (const raw of rows) {
    if (isFreshdesk(raw)) {
      const r = raw as FreshdeskRow;
      const id = r["Ticket Id"] || r["Ticket ID"] || null;
      const subject = (r.Subject || "").trim();
      const body = (r.Description || "").trim();
      const text = [subject, body].filter(Boolean).join("\n\n");
      if (!text) continue;
      out.push({
        source: "ticket",
        company: (r.company || defaultCompany || "Unknown").trim(),
        text,
        rating: null,
        timestamp: toIso(r["Created Time"]),
        customer_id: r["Requester ID"] ? String(r["Requester ID"]) : null,
        metadata: {
          format: "freshdesk",
          status: r.Status ?? null,
          tags: r.Tags ?? null,
          priority: r.Priority ?? null,
          ticket_id: id,
        },
        external_id: id
          ? `fd-${id}`
          : `fd-${subject.slice(0, 40)}-${r["Created Time"]}`,
      });
      continue;
    }

    const r = raw as ZendeskRow;
    const subject = (r.subject || "").trim();
    const body = (r.description || r.body || "").trim();
    const text = [subject, body].filter(Boolean).join("\n\n");
    if (!text) continue;
    out.push({
      source: "ticket",
      company: (r.company || defaultCompany || "Unknown").trim(),
      text,
      rating: null,
      timestamp: toIso(r.created_at),
      customer_id: r.requester_id ? String(r.requester_id) : null,
      metadata: {
        format: "zendesk",
        status: r.status ?? null,
        tags: r.tags ?? null,
        priority: r.priority ?? null,
        ticket_id: r.id ?? null,
      },
      external_id: r.id
        ? `zd-${r.id}`
        : `zd-${subject.slice(0, 40)}-${r.created_at}`,
    });
  }
  return out;
}

export function parseTicketsCsv(
  csvText: string,
  defaultCompany?: string
): NormalizedFeedback[] {
  const parsed = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  return parseTicketRows(parsed.data, defaultCompany);
}
