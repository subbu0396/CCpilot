import { getParserForSource } from "@/lib/ingestion/parsers";
import {
  parseSource,
  runIngestionFromContent,
} from "@/lib/ingestion/run-ingestion";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const sourceRaw = formData.get("source");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (typeof sourceRaw !== "string") {
      return NextResponse.json({ error: "No source provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "File too large (max 5 MB)" },
        { status: 400 }
      );
    }

    const source = parseSource(sourceRaw);
    const parser = getParserForSource(source);
    const content = await file.text();
    const result = await runIngestionFromContent(
      source,
      content,
      file.name,
      parser
    );

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
