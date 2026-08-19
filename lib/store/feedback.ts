import type { NormalizedFeedback } from "@/lib/ingestion/schema";
import type { FeedbackItem } from "@/lib/supabase/types";
import { createServiceClient } from "@/lib/supabase/client";
import { upsertFeedbackItems as upsertRemote } from "@/lib/ingestion/upsert";
import { isLocalMode, readDb, writeDb, newId } from "./local-db";

export async function saveFeedbackItems(
  items: NormalizedFeedback[]
): Promise<{ inserted: number; errors: string[]; mode: "local" | "supabase" }> {
  if (isLocalMode()) {
    const db = readDb();
    let inserted = 0;
    for (const item of items) {
      const external_id = item.external_id ?? null;
      const idx = db.feedback_items.findIndex(
        (f) =>
          f.source === item.source &&
          f.company === item.company &&
          (f.external_id ?? null) === external_id
      );
      const row: FeedbackItem = {
        id: idx >= 0 ? db.feedback_items[idx].id : newId(),
        source: item.source,
        company: item.company,
        text: item.text,
        rating: item.rating,
        timestamp: item.timestamp,
        customer_id: item.customer_id,
        metadata: item.metadata ?? {},
        external_id,
        created_at: new Date().toISOString(),
      };
      if (idx >= 0) db.feedback_items[idx] = row;
      else {
        db.feedback_items.push(row);
        inserted += 1;
      }
    }
    // recount upserts as processed
    inserted = items.length;
    writeDb(db);
    return { inserted, errors: [], mode: "local" };
  }

  const supabase = createServiceClient();
  const result = await upsertRemote(supabase, items);
  return { ...result, mode: "supabase" };
}

export async function getFeedbackItemByExternalId(
  source: string,
  company: string,
  externalId: string
): Promise<FeedbackItem | null> {
  if (isLocalMode()) {
    const row = readDb().feedback_items.find(
      (f) =>
        f.source === source && f.company === company && f.external_id === externalId
    );
    return row ?? null;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("feedback_items")
    .select("*")
    .eq("source", source)
    .eq("company", company)
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FeedbackItem | null) ?? null;
}

export async function listFeedbackItems(filters?: {
  companies?: string[];
  sources?: string[];
  dateFrom?: string;
  dateTo?: string;
}): Promise<FeedbackItem[]> {
  if (isLocalMode()) {
    let rows = readDb().feedback_items;
    if (filters?.companies?.length) {
      rows = rows.filter((r) => filters.companies!.includes(r.company));
    }
    if (filters?.sources?.length) {
      rows = rows.filter((r) => filters.sources!.includes(r.source));
    }
    if (filters?.dateFrom) {
      rows = rows.filter((r) => r.timestamp >= filters.dateFrom!);
    }
    if (filters?.dateTo) {
      rows = rows.filter((r) => r.timestamp <= filters.dateTo!);
    }
    return rows;
  }

  const supabase = createServiceClient();
  let q = supabase.from("feedback_items").select("*");
  if (filters?.companies?.length) q = q.in("company", filters.companies);
  if (filters?.sources?.length) q = q.in("source", filters.sources as never);
  if (filters?.dateFrom) q = q.gte("timestamp", filters.dateFrom);
  if (filters?.dateTo) q = q.lte("timestamp", filters.dateTo);
  const { data, error } = await q.order("timestamp", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FeedbackItem[];
}
