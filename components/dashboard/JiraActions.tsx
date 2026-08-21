"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminFetch } from "@/lib/auth/admin-client";

const TRANSITION_STATUSES = ["Open", "In Progress", "Done"];

export function JiraActions({
  roadmapId,
  jiraIssueKey,
  onDone,
}: {
  roadmapId: string;
  jiraIssueKey: string | null;
  onDone: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [linking, setLinking] = useState(false);
  const [linkKey, setLinkKey] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setStatus("");
    try {
      const res = await adminFetch("/api/jira", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      await onDone();
      return json;
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createIssue() {
    await post({ action: "create", roadmap_id: roadmapId });
  }

  async function linkIssue() {
    if (!linkKey.trim() || !linkUrl.trim()) return;
    const result = await post({
      action: "link",
      roadmap_id: roadmapId,
      jira_issue_key: linkKey.trim(),
      jira_issue_url: linkUrl.trim(),
    });
    if (result) {
      setLinking(false);
      setLinkKey("");
      setLinkUrl("");
    }
  }

  async function transition(newStatus: string) {
    if (!jiraIssueKey) return;
    await post({ action: "transition", issue_key: jiraIssueKey, status: newStatus });
  }

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-1.5"
      onPointerDown={stop}
      onClick={stop}
    >
      {!jiraIssueKey && !linking && (
        <>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-1.5 text-[10px]"
            disabled={busy}
            onClick={() => void createIssue()}
          >
            Create Jira
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-1.5 text-[10px]"
            disabled={busy}
            onClick={() => setLinking(true)}
          >
            Link existing
          </Button>
        </>
      )}

      {!jiraIssueKey && linking && (
        <div className="flex w-full flex-col gap-1">
          <Input
            placeholder="Issue key (e.g. KAN-3)"
            value={linkKey}
            onChange={(e) => setLinkKey(e.target.value)}
            className="h-6 text-[10px]"
          />
          <Input
            placeholder="Issue URL"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            className="h-6 text-[10px]"
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="h-6 px-1.5 text-[10px]"
              disabled={busy}
              onClick={() => void linkIssue()}
            >
              Link
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-1.5 text-[10px]"
              disabled={busy}
              onClick={() => setLinking(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {jiraIssueKey && (
        <Select disabled={busy} onValueChange={(v) => void transition(v)}>
          <SelectTrigger size="sm" className="h-6 text-[10px]">
            <SelectValue placeholder="Transition…" />
          </SelectTrigger>
          <SelectContent>
            {TRANSITION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {status && <p className="w-full text-[10px] text-red-600">{status}</p>}
    </div>
  );
}
