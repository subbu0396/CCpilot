import { Resend } from "resend";
import { loadDashboardBundle } from "@/lib/store/dashboard-data";

export interface DigestData {
  generatedAt: string;
  topChurnRisk: { company: string; score: number; signal: string }[];
  topPainPoints: { company: string; severity: number; summary: string }[];
  promotedToNow: { featureName: string }[];
  escalationsThisWeek: number;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function buildWeeklyDigest(): Promise<DigestData> {
  const bundle = await loadDashboardBundle();
  const now = Date.now();
  const weekAgo = now - SEVEN_DAYS_MS;

  const fbById = new Map(bundle.feedback.map((f) => [f.id, f]));

  const topChurnRisk = bundle.churnSignals
    .filter((c) => c.churn_risk === "high")
    .map((c) => {
      const fb = fbById.get(c.feedback_item_id);
      return fb ? { company: fb.company, score: c.weighted_score ?? 0, signal: c.churn_signal } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const topPainPoints = bundle.painPoints
    .map((p) => {
      const fb = fbById.get(p.feedback_item_id);
      return fb ? { company: fb.company, severity: p.severity, summary: p.pain_point_summary } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 5);

  const featureById = new Map(bundle.features.map((f) => [f.id, f]));
  const promotedToNow = bundle.roadmap
    .filter((r) => {
      if (r.bucket !== "now" || !r.updated_at) return false;
      return new Date(r.updated_at).getTime() >= weekAgo;
    })
    .map((r) => ({ featureName: featureById.get(r.feature_id)?.feature_name ?? "(unknown feature)" }));

  const escalationsThisWeek = bundle.coreAnalysis.filter(
    (c) => c.zendesk_priority_escalation && c.created_at && new Date(c.created_at).getTime() >= weekAgo
  ).length;

  return {
    generatedAt: new Date(now).toISOString(),
    topChurnRisk,
    topPainPoints,
    promotedToNow,
    escalationsThisWeek,
  };
}

export function renderDigestHtml(data: DigestData): string {
  const row = (cells: string[]) =>
    `<tr>${cells.map((c) => `<td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;">${c}</td>`).join("")}</tr>`;

  const churnRows = data.topChurnRisk.length
    ? data.topChurnRisk
        .map((c) => row([c.company, String(c.score), c.signal]))
        .join("")
    : row(["—", "—", "No high-risk churn signals"]);

  const painRows = data.topPainPoints.length
    ? data.topPainPoints
        .map((p) => row([p.company, String(p.severity), p.summary]))
        .join("")
    : row(["—", "—", "No pain points recorded"]);

  const promotedList = data.promotedToNow.length
    ? `<ul>${data.promotedToNow.map((p) => `<li>${p.featureName}</li>`).join("")}</ul>`
    : "<p>Nothing new promoted to Now this week.</p>";

  return `
    <div style="font-family:sans-serif;color:#1a2332;max-width:640px;">
      <h1 style="font-size:20px;">CCPilot Weekly Digest</h1>
      <p style="color:#64748b;font-size:13px;">Generated ${data.generatedAt}</p>

      <h2 style="font-size:16px;margin-top:24px;">Top churn risk</h2>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">${churnRows}</table>

      <h2 style="font-size:16px;margin-top:24px;">Top pain points</h2>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">${painRows}</table>

      <h2 style="font-size:16px;margin-top:24px;">Promoted to Now this week</h2>
      ${promotedList}

      <h2 style="font-size:16px;margin-top:24px;">Escalations this week</h2>
      <p>${data.escalationsThisWeek} ticket(s) escalated via the Core Analysis Agent.</p>
    </div>
  `.trim();
}

export async function sendWeeklyDigestEmail(): Promise<{ sent: boolean; to?: string; reason?: string }> {
  const to = process.env.DIGEST_EMAIL_TO;
  const apiKey = process.env.RESEND_API_KEY;

  if (!to || !apiKey) {
    return { sent: false, reason: "RESEND_API_KEY or DIGEST_EMAIL_TO not configured" };
  }

  const data = await buildWeeklyDigest();
  const html = renderDigestHtml(data);

  const resend = new Resend(apiKey);
  const weekOf = new Date().toISOString().slice(0, 10);
  const { error } = await resend.emails.send(
    {
      from: "CCPilot Digest <onboarding@resend.dev>",
      to: [to],
      subject: `CCPilot Weekly Digest — ${weekOf}`,
      html,
    },
    { idempotencyKey: `weekly-digest/${weekOf}` }
  );

  if (error) {
    return { sent: false, reason: error.message };
  }

  return { sent: true, to };
}
