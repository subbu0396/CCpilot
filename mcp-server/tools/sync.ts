import { fetchZendeskTickets, hasZendeskCreds } from "@/lib/ingestion/zendesk-live";
import { validateFeedback } from "@/lib/ingestion/upsert";
import { saveFeedbackItems } from "@/lib/store/feedback";

export async function syncZendesk({ company }: { company?: string }) {
  if (!hasZendeskCreds()) {
    throw new Error(
      "Zendesk is not configured — set ZENDESK_SUBDOMAIN / ZENDESK_CLIENT_ID / ZENDESK_CLIENT_SECRET."
    );
  }

  const rows = await fetchZendeskTickets(company);
  const { valid, errors } = validateFeedback(rows);
  const saved = await saveFeedbackItems(valid);

  return {
    ...saved,
    fetched: rows.length,
    parsed: valid.length,
    validation_errors: errors.slice(0, 10),
  };
}
