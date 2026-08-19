"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Cookie-backed Supabase client for the browser — used only for the admin login session. */
export function createAuthBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
