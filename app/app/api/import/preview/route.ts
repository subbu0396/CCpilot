import { previewRows } from "@/lib/ingestion/parse-content";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "File too large (max 5 MB)" },
        { status: 400 }
      );
    }

    const content = await file.text();
    const rows = previewRows(content, file.name, 10);

    return NextResponse.json({ rows, total_preview: rows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse file";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
