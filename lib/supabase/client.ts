import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Node.js < 22 has no native WebSocket global, which @supabase/realtime-js
// requires even though this app never opens a realtime subscription.
const realtimeTransport =
  typeof WebSocket === "undefined"
    ? { transport: require("ws") }
    : undefined;

export function createBrowserClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  return createClient<Database>(url, key, {
    realtime: realtimeTransport,
  });
}

export function createServiceClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: realtimeTransport,
  });
}

/** Prefer service role for scripts/pipeline; fall back to anon in browser. */
export function getSupabase(): SupabaseClient<Database> {
  if (typeof window === "undefined" && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createServiceClient();
  }
  return createBrowserClient();
}
