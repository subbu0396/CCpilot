/**
 * Generates 6 sample CSV files (~75 rows each = 450 total) for
 * Flowdesk / Trackr / NovaPulse across playstore and tickets.
 *
 * Run: npx tsx scripts/generate-sample-data.ts
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "sample-data");
const ROWS_PER_FILE = 75;

type Company = "Flowdesk" | "Trackr" | "NovaPulse";

const THEMES: Record<
  Company,
  { areas: string[]; pains: string[]; positives: string[]; churn: string[] }
> = {
  Flowdesk: {
    areas: ["Onboarding", "Permissions", "Mobile Sync", "Notifications", "Templates"],
    pains: [
      "Inviting teammates during onboarding is confusing and requires too many clicks",
      "Permission roles are unclear — editors accidentally delete project boards",
      "Mobile app sync lags by hours; offline edits often conflict",
      "Push notifications fire twice for the same task assignment",
      "Project templates cannot be shared across workspaces",
      "Cannot nest subtasks more than two levels deep",
      "SSO setup docs are outdated and broke our Okta trial",
      "Calendar integration drops recurring meetings randomly",
      "Guest access still shows private comments from the core team",
      "Board filters reset every time I refresh the page",
    ],
    positives: [
      "Love the clean board view — finally replaced our sticky-note chaos",
      "Templates saved our team hours when spinning up new client projects",
      "Customer support responded within an hour and fixed our invite bug",
      "Dark mode on mobile is polished and easy on the eyes",
      "Keyboard shortcuts make daily triage much faster",
    ],
    churn: [
      "We are evaluating Asana because onboarding still takes a full week",
      "If mobile sync is not fixed we will cancel at renewal",
      "Third escalation this month about permissions — considering Monday.com",
      "Repeated complaint: guests see private threads. Escalating to our VP",
    ],
  },
  Trackr: {
    areas: ["Reporting", "Integrations", "Deal Pipeline", "Email Sync", "Forecasting"],
    pains: [
      "Custom reports cannot join deals with activity history",
      "Salesforce sync duplicates contacts every night",
      "Deal stages cannot be reordered without breaking forecasts",
      "Email tracking misses threads from our Google Workspace alias",
      "Pipeline board freezes when we have more than 2k open deals",
      "Forecast categories ignore probability overrides set by managers",
      "HubSpot import drops custom fields silently",
      "Cannot filter won deals by competitor displaced",
      "Activity reminders fire for closed-lost opportunities",
      "Territory assignment rules conflict with round-robin leads",
    ],
    positives: [
      "Deal timeline view is the best we have used in any CRM",
      "Forecast rollups finally match what finance expects",
      "Zapier integration covered our niche enrichment workflow",
      "Mobile call logging is surprisingly accurate",
      "UI feels faster after the Q1 performance release",
    ],
    churn: [
      "Sales leadership is piloting HubSpot — reporting gaps are the reason",
      "We will not renew if Salesforce sync keeps duplicating accounts",
      "Repeated complaint about pipeline freezes — ops wants to switch",
      "Looking at Pipedrive because custom reports are still impossible",
    ],
  },
  NovaPulse: {
    areas: ["Performance", "Dashboard UX", "Exports", "Query Builder", "Alerts"],
    pains: [
      "Dashboard queries time out after 30s on our production dataset",
      "Drag-and-drop widgets jump around when resizing columns",
      "CSV exports truncate at 50k rows without warning",
      "Query builder cannot express window functions we need for cohorts",
      "Anomaly alerts fire too late — often hours after the spike",
      "Sharing a dashboard with view-only users still allows chart edits",
      "Dark charts are unreadable when exporting to PDF",
      "Snowflake connector drops timezone info on TIMESTAMP_TZ columns",
      "Cannot pin a filter set across multiple dashboards",
      "Refresh schedules silently fail when the warehouse is paused",
    ],
    positives: [
      "Once queries are cached the dashboards feel instant",
      "Alert routing to Slack channels is exactly what we needed",
      "Love the cohort templates — saved our growth team days of work",
      "Support walked us through warehouse permissions patiently",
      "New SQL editor autocomplete is a huge quality-of-life win",
    ],
    churn: [
      "Evaluating Looker because exports and timeouts are blocking exec reporting",
      "If query performance is not fixed we cancel before Q4",
      "Third ticket this week about CSV truncation — considering Mode Analytics",
      "Frustration escalating: dashboard UX regressions after last release",
    ],
  },
};

function pad(n: number, width = 3) {
  return String(n).padStart(width, "0");
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(values: (string | number | null | undefined)[]): string {
  return values.map(csvEscape).join(",");
}

function daysAgo(i: number): Date {
  const d = new Date("2026-07-15T12:00:00.000Z");
  d.setUTCDate(d.getUTCDate() - (i % 120));
  d.setUTCHours(8 + (i % 10), (i * 7) % 60, 0, 0);
  return d;
}

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

function severityBucket(i: number): "positive" | "neutral" | "pain" | "churn" {
  const m = i % 10;
  if (m === 0 || m === 1) return "positive";
  if (m === 2) return "neutral";
  if (m === 8 || m === 9) return "churn";
  return "pain";
}

function ratingFor(kind: ReturnType<typeof severityBucket>, i: number): number {
  if (kind === "positive") return 4 + (i % 2); // 4–5
  if (kind === "neutral") return 3;
  if (kind === "churn") return 1 + (i % 2); // 1–2
  return 2 + (i % 2); // 2–3
}

function buildText(
  company: Company,
  kind: ReturnType<typeof severityBucket>,
  i: number
): { title: string; body: string } {
  const t = THEMES[company];
  const area = pick(t.areas, i);
  if (kind === "positive") {
    const p = pick(t.positives, i);
    return { title: `Great ${area.toLowerCase()} experience`, body: p };
  }
  if (kind === "neutral") {
    return {
      title: `${area} is okay`,
      body: `${area} works for basic use but lacks polish compared to alternatives. Ticket #${1000 + i}.`,
    };
  }
  if (kind === "churn") {
    const c = pick(t.churn, i);
    return { title: `Considering alternatives — ${area}`, body: c };
  }
  const pain = pick(t.pains, i);
  return {
    title: `${area} issue`,
    body: `${pain}. Context: ${area} workflow on ${company}.`,
  };
}

function writePlayStore(company: Company) {
  const lines = [
    row(["reviewId", "userName", "score", "content", "at", "company", "thumbsUpCount"]),
  ];
  for (let i = 1; i <= ROWS_PER_FILE; i++) {
    const kind = severityBucket(i);
    const { body } = buildText(company, kind, i);
    const score = ratingFor(kind, i);
    lines.push(
      row([
        `ps-${company.slice(0, 3).toLowerCase()}-${pad(i)}`,
        `user_${company.slice(0, 2).toLowerCase()}${pad(i)}`,
        score,
        body,
        daysAgo(i).toISOString(),
        company,
        i % 5,
      ])
    );
  }
  writeFileSync(
    join(OUT, `${company.toLowerCase()}_playstore.csv`),
    lines.join("\n") + "\n"
  );
}

function writeTickets(company: Company) {
  // Zendesk-style for Flowdesk & Trackr; Freshdesk-style for NovaPulse
  const useFreshdesk = company === "NovaPulse";
  const statuses = ["open", "pending", "solved", "closed"];
  const tagsByArea = THEMES[company].areas;

  if (useFreshdesk) {
    const lines = [
      row([
        "Ticket Id",
        "Subject",
        "Description",
        "Status",
        "Tags",
        "Requester ID",
        "Created Time",
        "company",
        "Priority",
      ]),
    ];
    for (let i = 1; i <= ROWS_PER_FILE; i++) {
      const kind = severityBucket(i + 1);
      const { title, body } = buildText(company, kind, i + 1);
      const priority =
        kind === "churn" ? "urgent" : kind === "pain" ? "high" : "medium";
      lines.push(
        row([
          `FD-${company.slice(0, 2).toUpperCase()}${pad(i)}`,
          title,
          body,
          pick(statuses, i),
          pick(tagsByArea, i).toLowerCase().replace(/\s+/g, "_"),
          `req_${pad(i + 200)}`,
          daysAgo(i + 2).toISOString(),
          company,
          priority,
        ])
      );
    }
    writeFileSync(
      join(OUT, `${company.toLowerCase()}_tickets.csv`),
      lines.join("\n") + "\n"
    );
    return;
  }

  const lines = [
    row([
      "id",
      "subject",
      "description",
      "status",
      "tags",
      "requester_id",
      "created_at",
      "company",
      "priority",
    ]),
  ];
  for (let i = 1; i <= ROWS_PER_FILE; i++) {
    const kind = severityBucket(i + 2);
    const { title, body } = buildText(company, kind, i + 2);
    const priority =
      kind === "churn" ? "urgent" : kind === "pain" ? "high" : "normal";
    lines.push(
      row([
        `${10000 + i}`,
        title,
        body,
        pick(statuses, i),
        pick(tagsByArea, i).toLowerCase().replace(/\s+/g, "_"),
        `zd_user_${pad(i)}`,
        daysAgo(i + 3).toISOString(),
        company,
        priority,
      ])
    );
  }
  writeFileSync(
    join(OUT, `${company.toLowerCase()}_tickets.csv`),
    lines.join("\n") + "\n"
  );
}

mkdirSync(OUT, { recursive: true });
(["Flowdesk", "Trackr", "NovaPulse"] as Company[]).forEach((c) => {
  writePlayStore(c);
  writeTickets(c);
  console.log(`Wrote sample CSVs for ${c}`);
});
console.log(`Done — ${3 * 2 * ROWS_PER_FILE} rows across 6 files in ${OUT}`);
