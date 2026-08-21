import { fetchZendeskTickets, hasZendeskCreds, escalateZendeskTicket } from "@/lib/ingestion/zendesk-live";
import { validateFeedback } from "@/lib/ingestion/upsert";
import { saveFeedbackItems, getFeedbackItemByExternalId } from "@/lib/store/feedback";
import { loadDashboardBundle } from "@/lib/store/dashboard-data";
import { runCoreAnalysis } from "@/lib/pipeline/core-analysis";
import { hasAnthropicKey } from "@/lib/pipeline/claude";
import { mapWithConcurrency } from "@/lib/pipeline/concurrency";

export async function syncZendesk({ company, analyze }: { company?: string; analyze?: boolean }) {
  if (!hasZendeskCreds()) {
    throw new Error(
      "Zendesk is not configured — set ZENDESK_SUBDOMAIN / ZENDESK_CLIENT_ID / ZENDESK_CLIENT_SECRET."
    );
  }

  const rows = await fetchZendeskTickets(company);
  const { valid, errors } = validateFeedback(rows);
  const saved = await saveFeedbackItems(valid);

  const result: {
    inserted: number;
    errors: string[];
    mode: "local" | "supabase";
    fetched: number;
    parsed: number;
    validation_errors: string[];
    analyzed?: number;
    escalated?: number;
    analysis_errors?: string[];
    analysis_skipped?: string;
  } = {
    ...saved,
    fetched: rows.length,
    parsed: valid.length,
    validation_errors: errors.slice(0, 10),
  };

  if (!analyze) return result;

  if (!hasAnthropicKey()) {
    result.analysis_skipped = "ANTHROPIC_API_KEY missing — sync succeeded but analysis was skipped.";
    return result;
  }

  const bundle = await loadDashboardBundle();
  const alreadyAnalyzed = new Set(bundle.coreAnalysis.map((c) => c.feedback_item_id));

  const pending = [];
  for (const row of valid) {
    if (!row.external_id) continue;
    const item = await getFeedbackItemByExternalId(row.source, row.company, row.external_id);
    if (item && !alreadyAnalyzed.has(item.id)) pending.push(item);
  }

  const analysisErrors: string[] = [];
  let escalated = 0;

  await mapWithConcurrency(pending, 10, async (item) => {
    try {
      const { result: analysis } = await runCoreAnalysis(item, {
        source: "Zendesk",
        customerTier: "Unknown",
      });
      if (analysis.zendesk_priority_escalation) {
        const ticketId = (item.metadata as { ticket_id?: number }).ticket_id;
        if (ticketId) {
          await escalateZendeskTicket(ticketId);
          escalated += 1;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      analysisErrors.push(`${item.id}: ${message}`);
    }
  });

  result.analyzed = pending.length - analysisErrors.length;
  result.escalated = escalated;
  result.analysis_errors = analysisErrors.slice(0, 10);
  return result;
}
