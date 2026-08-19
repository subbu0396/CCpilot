"use client";

/**
 * fetch() for admin-gated mutating endpoints. Auth is a real Supabase login
 * session (cookie-based, sent automatically) — no token to attach here. On
 * a 401 (not signed in / session expired), sends the user to /login instead
 * of throwing into the void so `catch` blocks at call sites still surface a
 * sane status message.
 */
export async function adminFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    const next = typeof window !== "undefined" ? window.location.pathname : "/";
    if (typeof window !== "undefined") {
      window.location.href = `/login?next=${encodeURIComponent(next)}`;
    }
    throw new Error("Not signed in — redirecting to login");
  }
  return res;
}
