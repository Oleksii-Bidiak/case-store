"use client";

import type { ReactNode } from "react";
import { PERM } from "@/entities/permission";
import { PermissionGate } from "@/entities/session";
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
 * Since TASK-639 the refusal itself is the shared `PermissionGate` — the same
 * box `/staff*`, `/audit-log` and `/orders/new` show — and this file only names
 * the right and the words.
 */
export function ReturnsPermissionGate({ children }: { children: ReactNode }) {
  return (
    <PermissionGate
      permission={PERM.returnsRead}
      title={dict.returns.forbidden}
      hint={dict.returns.forbiddenHint}
    >
      {children}
    </PermissionGate>
  );
}
