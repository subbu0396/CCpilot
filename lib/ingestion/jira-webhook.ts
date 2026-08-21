import { timingSafeEqual } from "node:crypto";

/**
 * Verifies a Jira webhook request. Jira's own webhook admin UI (Settings ->
 * System -> WebHooks) has no auth-header field like Zendesk's, only a target
 * URL — so the shared secret has to be embedded in the webhook URL's query
 * string at registration time (e.g. .../api/webhooks/jira?token=<secret>)
 * rather than sent as a header. Same timing-safe comparison as
 * verifyZendeskBearerToken, just reading from a query param.
 */
export function verifyJiraWebhookToken(opts: { token: string | null; secret: string }): boolean {
  const { token, secret } = opts;
  if (!token) return false;

  const expectedBuf = Buffer.from(secret);
  const actualBuf = Buffer.from(token);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

export function hasJiraWebhookSecret(): boolean {
  return Boolean(process.env.JIRA_WEBHOOK_SECRET);
}

/** Payload shape for jira:issue_updated / jira:issue_generic events. */
export interface JiraWebhookPayload {
  webhookEvent?: string;
  issue?: {
    key?: string;
    fields?: {
      status?: {
        name?: string;
        statusCategory?: {
          key?: string;
        };
      };
    };
  };
}

export function parseJiraWebhookPayload(
  payload: JiraWebhookPayload
): { issue_key: string; status_name: string; status_category?: string } | null {
  const key = payload.issue?.key;
  const status = payload.issue?.fields?.status;
  if (!key || !status?.name) return null;
  return {
    issue_key: key,
    status_name: status.name,
    status_category: status.statusCategory?.key,
  };
}
