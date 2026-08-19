import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

/** True if the current request carries a valid, signed-in Supabase session. */
export async function isAdminAuthorized(): Promise<boolean> {
  const supabase = await createAuthServerClient();
  const { data, error } = await supabase.auth.getClaims();
  return Boolean(data?.claims && !error);
}

export async function requireAdminAuth(): Promise<NextResponse | null> {
  if (await isAdminAuthorized()) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
