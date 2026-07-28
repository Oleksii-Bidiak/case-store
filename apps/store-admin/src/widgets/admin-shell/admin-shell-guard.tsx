"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/entities/session";
import { dict } from "@/shared/config";

/**
 * AdminShellGuard — route gate for the authenticated admin area.
 *
 *   - while the silent refresh is in-flight → full-screen spinner (avoids a
 *     flash-redirect for a staff member who is actually signed in);
 *   - resolved and not staff → client-side redirect to /login;
 *   - resolved and staff (ADMIN or MANAGER) → renders the shell ({children}).
 *
 * TASK-334: the gate is `isStaff`, not `isOwner`. It used to demand ADMIN, which
 * meant a MANAGER with a perfectly valid session was bounced straight back to
 * /login and no amount of granted permissions could get them in. What a manager
 * may then see inside is decided per nav item / per tile, and enforced for real
 * by the server guard on every request.
 */
export function AdminShellGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isInitializing, isStaff } = useAuth();

  useEffect(() => {
    if (!isInitializing && !isStaff) {
      router.replace("/login");
    }
  }, [isInitializing, isStaff, router]);

  if (isInitializing || !isStaff) {
    return (
      <div
        role="status"
        aria-label={dict.common.loading}
        className="flex h-screen items-center justify-center"
      >
        <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <span className="sr-only">{dict.common.loading}</span>
      </div>
    );
  }

  return <>{children}</>;
}
