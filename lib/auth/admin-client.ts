"use client";

const STORAGE_KEY = "ccpilot_admin_token";

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(STORAGE_KEY);
}

export function clearAdminToken() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}

function promptForToken(): string | null {
  const token = window.prompt("Enter admin token:");
  if (!token) return null;
  window.sessionStorage.setItem(STORAGE_KEY, token);
  return token;
}

function ensureAdminToken(): string | null {
  return getAdminToken() ?? promptForToken();
}

/**
 * fetch() for admin-gated mutating endpoints: attaches the stored token,
 * prompting once if missing, and retries once after a 401 by re-prompting.
 */
export async function adminFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const attempt = async (token: string | null) => {
    const headers = new Headers(init.headers);
    if (token) headers.set("x-admin-token", token);
    return fetch(input, { ...init, headers });
  };

  let token = ensureAdminToken();
  if (!token) throw new Error("Admin token required");

  let res = await attempt(token);
  if (res.status === 401) {
    clearAdminToken();
    token = ensureAdminToken();
    if (!token) throw new Error("Admin token required");
    res = await attempt(token);
  }
  return res;
}
