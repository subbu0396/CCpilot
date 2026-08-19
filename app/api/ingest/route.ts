import { NextRequest, NextResponse } from "next/server";
import { parsePlayStoreCsv } from "@/lib/ingestion/playstore";
import { parseTicketsCsv } from "@/lib/ingestion/tickets";
import { validateFeedback } from "@/lib/ingestion/upsert";
import { saveFeedbackItems } from "@/lib/store/feedback";
import { requireAdminAuth } from "@/lib/auth/admin";
import { fetchZendeskTickets, hasZendeskCreds } from "@/lib/ingestion/zendesk-live";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(req: NextRequest) {
  const authFail = await requireAdminAuth();
  if (authFail) return authFail;

  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await req.json();

      if (body.action === "sync_zendesk") {
        if (!hasZendeskCreds()) {
          return NextResponse.json({
            ok: false,
            message:
              "Missing ZENDESK_SUBDOMAIN / ZENDESK_CLIENT_ID / ZENDESK_CLIENT_SECRET — configure a Zendesk OAuth client (Confidential, client credentials grant) to enable live sync.",
          });
        }

        const company = typeof body.company === "string" ? body.company : undefined;
        const rows = await fetchZendeskTickets(company);
        const { valid, errors } = validateFeedback(rows);
        const saved = await saveFeedbackItems(valid);

        return NextResponse.json({
          ok: true,
          source: "zendesk_live",
          ...saved,
          parsed: valid.length,
          validation_errors: errors.slice(0, 10),
        });
      }

      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const source = String(form.get("source") || "");
    const company = String(form.get("company") || "") || undefined;

    if (!file) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    const text = await file.text();
    let rows;
    if (source === "playstore") rows = parsePlayStoreCsv(text, company);
    else if (source === "ticket") rows = parseTicketsCsv(text, company);
    else {
      return NextResponse.json(
        { error: "source must be playstore|ticket" },
        { status: 400 }
      );
    }

    const { valid, errors } = validateFeedback(rows);
    const preview = valid.slice(0, 5);

    if (form.get("preview") === "1") {
      return NextResponse.json({
        count: valid.length,
        errors: errors.slice(0, 10),
        preview,
      });
    }

    const result = await saveFeedbackItems(valid);
    return NextResponse.json({
      ...result,
      parsed: valid.length,
      validation_errors: errors.slice(0, 10),
      preview,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
