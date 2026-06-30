import { parse as parseCsv } from "csv-parse/sync";

export function parseFileContent(
  content: string,
  fileName: string
): unknown[] {
  const ext = fileName.split(".").pop()?.toLowerCase();

  if (ext === "json") {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  if (ext === "csv") {
    return parseCsv(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[];
  }

  throw new Error(`Unsupported file type: ${ext}. Use .csv or .json`);
}

export function previewRows(
  content: string,
  fileName: string,
  limit = 10
): Record<string, string>[] {
  const rows = parseFileContent(content, fileName);
  return rows.slice(0, limit) as Record<string, string>[];
}
