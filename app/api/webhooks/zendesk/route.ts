import { NextRequest, NextResponse } from "next/server";
import {
  verifyZendeskBearerToken,
  hasZendeskWebhookSecret,
  normalizeZendeskWebhookPayload,
  type ZendeskWebhookPayload,
} from "@/lib/ingestion/zendesk-webhook";
import { validateFeedback } from "@/lib/ingestion/upsert";
import { saveFeedbackItems, getFeedbackItemByExternalId } from "@/lib/store/feedback";
import { runCoreAnalysis } from "@/lib/pipeline/core-analysis";
import { hasZendeskCreds, getAccessToken } from "@/lib/ingestion/zendesk-live";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Sets a Zendesk ticket to urgent priority + tags it when the Core Analysis
 * Agent flags escalation. Best-effort: failures here never fail the webhook
 * response. Two separate calls on purpose: `additional_tags` on the
 * single-ticket PUT is silently ignored by Zendesk (it's only honored on
 * the bulk update_many endpoint) — tags must go through the dedicated
 * PUT /tickets/{id}/tags.json endpoint, which adds without clobbering.
 */
async function escalateZendeskTicket(ticketId: number | string) {
  if (!hasZendeskCreds()) return;
  try {
    const subdomain = process.env.ZENDESK_SUBDOMAIN!;
    const accessToken = await getAccessToken(subdomain);
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    await fetch(`https://${subdomain}.zendesk.com/api/v2/tickets/${ticketId}.json`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ ticket: { priority: "urgent" } }),
    });

    await fetch(`https://${subdomain}.zendesk.com/api/v2/tickets/${ticketId}/tags.json`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ tags: ["churn_risk_flagged"] }),
    });
  } catch (err) {
    console.error(`[zendesk-webhook] priority escalation failed for ticket ${ticketId}:`, err);
  }
}

export async function POST(req: NextRequest) {
  if (!hasZendeskWebhookSecret()) {
    return NextResponse.json(
      { error: "ZENDESK_WEBHOOK_SECRET not configured" },
      { status: 500 }
    );
  }

  const rawBody = await req.text();
  const verified = verifyZendeskBearerToken({
    authHeader: req.headers.get("authorization"),
    secret: process.env.ZENDESK_WEBHOOK_SECRET!,
  });
  if (!verified) {
    return NextResponse.json({ error: "Invalid or missing bearer token" }, { status: 401 });
  }

  let payload: ZendeskWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const normalized = normalizeZendeskWebhookPayload(payload);
  if (!normalized) {
    return NextResponse.json({ ok: true, skipped: "empty ticket text" });
  }

  const { valid, errors } = validateFeedback([normalized]);
  if (!valid.length) {
    return NextResponse.json({ ok: false, errors }, { status: 400 });
  }

  await saveFeedbackItems(valid);
  const item = await getFeedbackItemByExternalId(
    valid[0].source,
    valid[0].company,
    valid[0].external_id!
  );
  if (!item) {
    return NextResponse.json(
      { ok: false, error: "Feedback item failed to persist" },
      { status: 500 }
    );
  }

  try {
    const { result } = await runCoreAnalysis(item, {
      source: "Zendesk",
      customerTier: payload.customer_tier || "Unknown",
    });

    if (result.zendesk_priority_escalation) {
      await escalateZendeskTicket(payload.ticket_id);
    }

    return NextResponse.json({
      ok: true,
      feedback_item_id: item.id,
      analysis: result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, feedback_item_id: item.id, error: message }, { status: 500 });
  }
}
