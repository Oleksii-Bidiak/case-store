"use client";

import type { ReactNode } from "react";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { dict } from "@/shared/config";

/**
 * Route gate for `/returns` and `/returns/[id]` (TASK-370).
 *
 * Until now these two pages were covered by `AdminShellGuard` alone, which asks
 * only `isStaff`. That is the right gate for the shell — a manager with a valid
 * session must get in — but it is not a gate on this section: it let anyone with
 * any staff account read every return in the shop, with the customer's email,
 * the operator's internal notes and the refunded amounts, simply by typing the
 * URL. `PERM.returnsRead` was declared for exactly this and, before this change,
 * was referenced nowhere in the admin panel at all.
 *
 * WHAT THIS IS AND IS NOT. It is convenience and honesty, not protection: the
 * server's `@RequirePermission('returns:read')` on `AdminReturnController` is the
 * control, and it answers 403 whatever this component decides. What the gate buys
 * is that the manager sees one sentence naming the permission they are missing
 * instead of a page of failed requests — the difference between "ask the owner to
 * tick a box" and "the panel is broken".
 *
 * `arePermissionsLoading` is checked before the refusal, not after: the grant set
 * arrives on its own request, so rendering the refusal first would flash "no
 * access" at every operator who genuinely has it.
 */
export function ReturnsPermissionGate({ children }: { children: ReactNode }) {
  const { can, arePermissionsLoading } = useAuth();

  if (arePermissionsLoading) {
    return (
      <div
        role="status"
        aria-label={dict.common.loading}
        className="flex min-h-40 items-center justify-center"
      >
        <div className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <span className="sr-only">{dict.common.loading}</span>
      </div>
    );
  }

  if (!can(PERM.returnsRead)) {
    return (
      <div
        role="alert"
        className="flex flex-col gap-2 rounded-md border border-border p-6"
      >
        <p className="text-sm font-medium text-foreground">
          {dict.returns.forbidden}
        </p>
        <p className="text-sm text-muted-foreground">
          {dict.returns.forbiddenHint}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
