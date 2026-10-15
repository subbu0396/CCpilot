import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session cookie on every request. This app has
 * no protected pages (the dashboard is publicly viewable) — only specific
 * API routes require a session, checked via lib/auth/admin.ts — so this
 * middleware's only job is keeping the session cookie fresh, not gating
 * navigation.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // No Supabase auth cookie → nothing to refresh, skip the network round-trip.
  if (!request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Bound the refresh so an unreachable Supabase can't hang every request
  // into a MIDDLEWARE_INVOCATION_TIMEOUT. On failure the page still renders;
  // the session just isn't refreshed this time.
  try {
    await Promise.race([
      supabase.auth.getClaims(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Supabase session refresh timed out")), 3000)
      ),
    ]);
  } catch (err) {
    console.error("[middleware]", err);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
