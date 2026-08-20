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

function jiraBaseUrl(): string {
  return process.env.JIRA_BASE_URL!.replace(/\/$/, "");
}

function jiraAuthHeaders(): Record<string, string> {
  const auth = Buffer.from(
    `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
  ).toString("base64");
  return { Authorization: `Basic ${auth}`, "Content-Type": "application/json" };
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

  const baseUrl = jiraBaseUrl();

  const res = await fetch(`${baseUrl}/rest/api/3/issue`, {
    method: "POST",
    headers: jiraAuthHeaders(),
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

interface JiraTransition {
  id: string;
  name: string;
  to: { name: string };
}

/** Lists the transitions actually available on this issue right now (workflow-state-dependent). */
export async function listJiraTransitions(issueKey: string): Promise<JiraTransition[]> {
  if (!hasJiraCreds()) {
    throw new Error("Missing JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN / JIRA_PROJECT_KEY");
  }

  const baseUrl = jiraBaseUrl();
  const res = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/transitions`, {
    headers: jiraAuthHeaders(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fetching Jira transitions failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as { transitions: JiraTransition[] };
  return json.transitions;
}

/**
 * Transitions an issue to a target status by name (e.g. "Done", "In Progress"),
 * matched case-insensitively against either the transition's own name or its
 * destination status name — Jira transition IDs are workflow-specific and not
 * meant to be hardcoded by callers, so this resolves the right one at call time.
 */
export async function transitionJiraIssue(
  issueKey: string,
  targetStatus: string
): Promise<{ transitioned_to: string }> {
  if (!hasJiraCreds()) {
    throw new Error("Missing JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN / JIRA_PROJECT_KEY");
  }

  const transitions = await listJiraTransitions(issueKey);
  const target = targetStatus.trim().toLowerCase();
  const match = transitions.find(
    (t) => t.name.toLowerCase() === target || t.to.name.toLowerCase() === target
  );

  if (!match) {
    const available = transitions.map((t) => t.to.name).join(", ") || "(none available)";
    throw new Error(
      `No transition to "${targetStatus}" available on ${issueKey} from its current status. Available: ${available}`
    );
  }

  const baseUrl = jiraBaseUrl();
  const res = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/transitions`, {
    method: "POST",
    headers: jiraAuthHeaders(),
    body: JSON.stringify({ transition: { id: match.id } }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira transition failed (${res.status}): ${body.slice(0, 300)}`);
  }

  return { transitioned_to: match.to.name };
}
