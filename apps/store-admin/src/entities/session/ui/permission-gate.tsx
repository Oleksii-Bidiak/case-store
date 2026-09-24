"use client";

import type { ReactNode } from "react";
import { dict } from "@/shared/config";
import { useAuth } from "../model/use-auth";

type PermissionGateProps = {
  /** The permission key the section needs, e.g. `PERM.staffRead`. */
  permission: string;
  children: ReactNode;
} & (
  | {
      /** First line of the refusal — WHAT is refused. */
      title: string;
      /** Second line — who can grant it, or who has it. */
      hint: string;
      fallback?: never;
    }
  | {
      /**
       * Rendered INSTEAD of the refusal — `null` to hide silently. For a
       * control that sits beside a section the same gate already refuses once
       * (a header button next to the refused table), so the page still shows ONE
       * refusal, not two.
       */
      fallback: ReactNode;
      title?: never;
      hint?: never;
    }
);

/**
 * Route gate: one clean refusal instead of a page of failed requests (TASK-639).
 *
 * Generalised from `ReturnsPermissionGate` (TASK-370). Before it, a manager who
 * typed `/staff` or `/audit-log` got the page with two red «не вдалося
 * завантажити» banners — every query on it answered 403, and each said so on its
 * own. That reads as "the panel is broken", when the truth is "this section is
 * not yours".
 *
 * WHAT THIS IS AND IS NOT. Convenience and honesty, not protection: the
 * server's `@RequirePermission` is the control and answers 403 whatever this
 * component decides. The children are not rendered at all without the right, so
 * their queries are never issued either.
 *
 * `arePermissionsLoading` is checked BEFORE the refusal: the grant set arrives
 * on its own request, and refusing first would flash "no access" at every
 * operator who genuinely has it. The owner and deputies pass through `can()`.
 */
export function PermissionGate(props: PermissionGateProps) {
  const { permission, children } = props;
  const { can, arePermissionsLoading } = useAuth();

  if (props.fallback !== undefined) {
    // A silent gate shows nothing while it waits either: the spinner belongs to
    // the section, not to every control that shares its right.
    return arePermissionsLoading || !can(permission) ? (
      <>{props.fallback}</>
    ) : (
      <>{children}</>
    );
  }

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

  if (!can(permission)) {
    return (
      <div
        role="alert"
        className="flex flex-col gap-2 rounded-md border border-border p-6"
      >
        <p className="text-sm font-medium text-foreground">{props.title}</p>
        <p className="text-sm text-muted-foreground">{props.hint}</p>
      </div>
    );
  }

  return <>{children}</>;
}
