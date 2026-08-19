"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { IngestPanel } from "./IngestPanel";
import { createAuthBrowserClient } from "@/lib/supabase/auth-browser";

function useAuthEmail(): string | null {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createAuthBrowserClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return email;
}

export function SidebarNav() {
  const router = useRouter();
  const email = useAuthEmail();

  async function signOut() {
    const supabase = createAuthBrowserClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  return (
    <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-[#1a2332] text-[#f7f5f1] lg:block">
      <div className="sticky top-0 flex h-screen flex-col overflow-y-auto px-4 py-6">
        <div className="mb-6 px-2">
          <p className="font-[family-name:var(--font-display)] text-xl tracking-tight">
            CCPilot
          </p>
          <p className="mt-1 text-xs text-slate-400">Customer Intelligence</p>
        </div>

        <div>
          <IngestPanel />
        </div>

        <div className="mt-auto pt-6">
          <Separator className="my-2 bg-white/10" />
          <div className="px-2">
            {email ? (
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs text-slate-400" title={email}>
                  {email}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-xs text-slate-300 hover:text-white"
                  onClick={() => void signOut()}
                >
                  Sign out
                </Button>
              </div>
            ) : (
              <Button asChild size="sm" variant="secondary" className="w-full text-sm">
                <a href="/login">Sign in</a>
              </Button>
            )}
          </div>
          <p className="mt-2 px-2 text-[10px] text-slate-500">Single-page copilot</p>
        </div>
      </div>
    </aside>
  );
}
