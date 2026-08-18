import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePlayStoreCsv } from "@/lib/ingestion/playstore";
import { parseTicketsCsv } from "@/lib/ingestion/tickets";
import { parseG2Csv } from "@/lib/ingestion/g2-csv";
import { validateFeedback } from "@/lib/ingestion/upsert";
import { saveFeedbackItems } from "@/lib/store/feedback";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await req.json();

      if (body.action === "sync_g2") {
        // Live G2 API requires G2_API_KEY via MCP server.
        // Demo path: re-import sample G2 CSVs with the same normalization.
        if (process.env.G2_API_KEY && body.product_id) {
          return NextResponse.json({
            ok: false,
            message:
              "Live G2 sync is available via the MCP `fetch_g2_reviews` tool. Use the MCP server or omit product_id to import sample CSVs.",
          });
        }

        const files = [
          ["flowdesk_g2.csv", "Flowdesk"],
          ["trackr_g2.csv", "Trackr"],
          ["novapulse_g2.csv", "NovaPulse"],
        ] as const;

        const results = [];
        for (const [file, company] of files) {
          const text = readFileSync(
            join(process.cwd(), "sample-data", file),
            "utf8"
          );
          const rows = parseG2Csv(text, company);
          const { valid, errors } = validateFeedback(rows);
          const saved = await saveFeedbackItems(valid);
          results.push({
            file,
            company,
            ...saved,
            parsed: valid.length,
            errors: errors.slice(0, 5),
          });
        }

        return NextResponse.json({
          ok: true,
          mode: "csv_fallback",
          message:
            "G2_API_KEY absent — imported sample G2 CSVs (same mapping as MCP import_g2_csv)",
          results,
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
    else if (source === "g2") rows = parseG2Csv(text, company);
    else {
      return NextResponse.json(
        { error: "source must be playstore|ticket|g2" },
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
