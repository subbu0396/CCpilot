import { createHmac, timingSafeEqual } from "node:crypto";
import type { NormalizedFeedback } from "./schema";

/**
 * Verifies a Zendesk webhook request using the signing secret shown when the
 * webhook is created in Admin Center → Apps and integrations → Webhooks.
 * Zendesk signs `timestamp + rawBody` with HMAC-SHA256, base64-encoded, and
 * sends it as `X-Zendesk-Webhook-Signature` alongside
 * `X-Zendesk-Webhook-Signature-Timestamp`. Verification must run against the
 * raw request body — parse JSON only after this passes.
 *
 * Not used by default (see verifyZendeskBearerToken below) since the
 * signing secret isn't exposed on the webhook creation form in every
 * account/version — it only appears on the webhook's detail page after
 * saving, under a separate "Signing Secret" tab. Kept here in case that
 * path is available; switch the route back to this if so.
 */
export function verifyZendeskSignature(opts: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  secret: string;
}): boolean {
  const { rawBody, timestamp, signature, secret } = opts;
  if (!timestamp || !signature) return false;

  const expected = createHmac("sha256", secret)
    .update(timestamp + rawBody)
    .digest("base64");

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Verifies the webhook using a bearer token you choose yourself, set as the
 * webhook's Authentication = "Bearer token" in Zendesk. Simpler than the
 * HMAC signing secret and works from the standard webhook creation form.
 */
export function verifyZendeskBearerToken(opts: {
  authHeader: string | null;
  secret: string;
}): boolean {
  const { authHeader, secret } = opts;
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice("Bearer ".length);

  const expectedBuf = Buffer.from(secret);
  const actualBuf = Buffer.from(token);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

export function hasZendeskWebhookSecret(): boolean {
  return Boolean(process.env.ZENDESK_WEBHOOK_SECRET);
}

/** Payload shape produced by the trigger JSON body — see NOTES.md for the exact template to paste into Zendesk. */
export interface ZendeskWebhookPayload {
  ticket_id: number | string;
  subject?: string;
  description?: string;
  status?: string;
  priority?: string | null;
  tags?: string[] | string;
  requester_id?: number | string;
  organization?: string;
  customer_tier?: string;
  created_at?: string;
}

export function normalizeZendeskWebhookPayload(
  payload: ZendeskWebhookPayload
): NormalizedFeedback | null {
  const subject = (payload.subject || "").trim();
  const body = (payload.description || "").trim();
  const text = [subject, body].filter(Boolean).join("\n\n");
  if (!text) return null;

  const tags = Array.isArray(payload.tags)
    ? payload.tags
    : typeof payload.tags === "string" && payload.tags.length
      ? payload.tags.split(/[\s,]+/).filter(Boolean)
      : [];

  return {
    source: "ticket",
    company: (payload.organization || "Unknown").trim(),
    text,
    rating: null,
    timestamp: payload.created_at || new Date().toISOString(),
    customer_id: payload.requester_id ? String(payload.requester_id) : null,
    metadata: {
      format: "zendesk",
      status: payload.status ?? null,
      tags,
      priority: payload.priority ?? null,
      ticket_id: payload.ticket_id,
      customer_tier: payload.customer_tier ?? null,
    },
    external_id: `zd-${payload.ticket_id}`,
  };
}
