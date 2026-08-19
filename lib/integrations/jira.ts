/**
 * Jira Cloud issue creation — direct REST API v3 with an API token
 * (Basic Auth: email:token), same server-to-server shape as the Zendesk
 * OAuth client in lib/ingestion/zendesk-live.ts. No third-party middleman.
 *
 * Setup: create an API token at
 * https://id.atlassian.com/manage-profile/security/api-tokens
 */

export function hasJiraCreds(): boolean {
  return Boolean(
    process.env.JIRA_BASE_URL &&
      process.env.JIRA_EMAIL &&
      process.env.JIRA_API_TOKEN &&
      process.env.JIRA_PROJECT_KEY
  );
}

/** Wraps plain text into the minimal Atlassian Document Format Jira Cloud's v3 API requires for the description field. */
function toAdf(text: string) {
  return {
    type: "doc",
    version: 1,
    content: text
      .split("\n\n")
      .filter(Boolean)
      .map((paragraph) => ({
        type: "paragraph",
        content: [{ type: "text", text: paragraph }],
      })),
  };
}

export async function createJiraIssue(opts: {
  summary: string;
  description: string;
  labels?: string[];
}): Promise<{ key: string; url: string }> {
  if (!hasJiraCreds()) {
    throw new Error(
      "Missing JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN / JIRA_PROJECT_KEY"
    );
  }

  const baseUrl = process.env.JIRA_BASE_URL!.replace(/\/$/, "");
  const auth = Buffer.from(
    `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
  ).toString("base64");

  const res = await fetch(`${baseUrl}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        project: { key: process.env.JIRA_PROJECT_KEY },
        summary: opts.summary,
        description: toAdf(opts.description),
        issuetype: { name: process.env.JIRA_ISSUE_TYPE || "Task" },
        labels: opts.labels ?? [],
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira issue creation failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as { key: string };
  return { key: json.key, url: `${baseUrl}/browse/${json.key}` };
}
