import type { NormalizedFeedback } from "./schema";

/**
 * Live Zendesk connector — OAuth client credentials grant (server-to-server,
 * no user/browser involved). Zendesk is retiring static API tokens
 * (blocked for new accounts since 2026-07-28, fully removed 2027-04-30), so
 * this uses an OAuth confidential client instead of `email/token:token`.
 *
 * Setup: Admin Center → Apps and integrations → APIs → OAuth clients →
 * Add OAuth client, Client Kind = Confidential. No redirect URL needed.
 */

export function hasZendeskCreds(): boolean {
  return Boolean(
    process.env.ZENDESK_SUBDOMAIN &&
      process.env.ZENDESK_CLIENT_ID &&
      process.env.ZENDESK_CLIENT_SECRET
  );
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let tokenCache: CachedToken | null = null;

export async function getAccessToken(subdomain: string): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.accessToken;
  }

  const clientId = process.env.ZENDESK_CLIENT_ID!;
  const clientSecret = process.env.ZENDESK_CLIENT_SECRET!;

  const res = await fetch(`https://${subdomain}.zendesk.com/oauth/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "tickets:read tickets:write",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zendesk OAuth token request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return tokenCache.accessToken;
}

interface ZendeskApiTicket {
  id: number;
  subject?: string;
  description?: string;
  status?: string;
  tags?: string[];
  priority?: string | null;
  requester_id?: number;
  created_at?: string;
}

interface ZendeskTicketsResponse {
  tickets: ZendeskApiTicket[];
  next_page: string | null;
  count: number;
}

function normalizeZendeskTicket(
  ticket: ZendeskApiTicket,
  fallbackCompany?: string
): NormalizedFeedback | null {
  const subject = (ticket.subject || "").trim();
  const body = (ticket.description || "").trim();
  const text = [subject, body].filter(Boolean).join("\n\n");
  if (!text) return null;

  return {
    source: "ticket",
    company: (fallbackCompany || "Unknown").trim(),
    text,
    rating: null,
    timestamp: ticket.created_at || new Date().toISOString(),
    customer_id: ticket.requester_id ? String(ticket.requester_id) : null,
    metadata: {
      format: "zendesk",
      status: ticket.status ?? null,
      tags: ticket.tags ?? [],
      priority: ticket.priority ?? null,
      ticket_id: ticket.id,
    },
    external_id: `zd-${ticket.id}`,
  };
}

/** Fetches all tickets from the configured Zendesk account and normalizes them. */
export async function fetchZendeskTickets(
  company?: string
): Promise<NormalizedFeedback[]> {
  if (!hasZendeskCreds()) {
    throw new Error(
      "Missing ZENDESK_SUBDOMAIN / ZENDESK_CLIENT_ID / ZENDESK_CLIENT_SECRET"
    );
  }

  const subdomain = process.env.ZENDESK_SUBDOMAIN!;
  const accessToken = await getAccessToken(subdomain);

  const all: NormalizedFeedback[] = [];
  let url: string | null = `https://${subdomain}.zendesk.com/api/v2/tickets.json?per_page=100`;

  while (url) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Zendesk API ${res.status}: ${errBody.slice(0, 300)}`);
    }
    const json = (await res.json()) as ZendeskTicketsResponse;
    for (const ticket of json.tickets ?? []) {
      const normalized = normalizeZendeskTicket(ticket, company);
      if (normalized) all.push(normalized);
    }
    url = json.next_page;
  }

  return all;
}
