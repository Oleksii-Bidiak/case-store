"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/entities/session";

/**
 * AdminShellGuard — route gate for the authenticated admin area.
 *
 *   - while the silent refresh is in-flight → full-screen spinner (avoids a
 *     flash-redirect for an admin who is actually signed in);
 *   - resolved and not an admin → client-side redirect to /login;
 *   - resolved and admin → renders the protected shell ({children}).
 */
export function AdminShellGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isInitializing, isAdmin } = useAuth();

  useEffect(() => {
    if (!isInitializing && !isAdmin) {
      router.replace("/login");
    }
  }, [isInitializing, isAdmin, router]);

  if (isInitializing || !isAdmin) {
    return (
      <div
        role="status"
        aria-label="Loading"
        className="flex h-screen items-center justify-center"
      >
        <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  return <>{children}</>;
}
