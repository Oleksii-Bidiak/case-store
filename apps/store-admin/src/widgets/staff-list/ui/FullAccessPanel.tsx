"use client";

import Link from "next/link";
import { ShieldUser } from "lucide-react";
import {
  ListStaffRole,
  staffDisplayName,
  useListStaff,
} from "@/entities/staff";
import { Badge } from "@/shared/ui";
import { dict } from "@/shared/config";

const d = dict.staff;

/**
 * «Повний доступ мають N осіб» — a standing panel that names them
 * (plan 181, decision 5).
 *
 * ## Why a count is shown instead of a cap being enforced
 *
 * The obvious protection against "too many administrators" is an upper limit,
 * and the owner rejected it, for the same reason B-1 gave: hard-forbid only what
 * is physically impossible, and make the rest visible. A cap of, say, three
 * would be a number nobody can justify, it would block a legitimate fourth hire
 * at the worst possible moment, and — crucially — it would not answer the
 * question that actually matters. The risk is not the count. The risk is that
 * somebody was granted full access two years ago and nobody remembers. A number
 * with the names under it answers that every time the register is opened; a cap
 * answers it never.
 *
 * ## Why this is a separate query from the table's
 *
 * The table is paginated, searched and filtered by the operator, so "who has full
 * access" would be a different answer on every page and would vanish the moment
 * somebody typed in the search box — the panel has to be true regardless of what
 * the list below it is currently showing. One narrow request (`role=ADMIN`)
 * answers it; React Query keeps it under its own key and refetches it on the
 * panel's own terms.
 *
 * DEACTIVATED ADMINS ARE COUNTED, deliberately: an account that cannot sign in
 * today is one status toggle away from full access tomorrow, and the audit
 * question this panel exists for is "who could" rather than "who is online". The
 * badge on the row says which are switched off.
 */
export function FullAccessPanel() {
  const { data, isLoading, isError } = useListStaff({
    role: ListStaffRole.ADMIN,
    limit: 100,
  });

  if (isLoading) {
    return (
      <section className="rounded-md border border-border p-4">
        <div className="h-4 w-64 max-w-full animate-pulse rounded bg-muted" />
      </section>
    );
  }

  if (isError) {
    return (
      <section className="rounded-md border border-border p-4">
        <p role="alert" className="text-sm text-destructive">
          {d.fullAccessLoadError}
        </p>
      </section>
    );
  }

  const admins = data?.data ?? [];
  const total = data?.meta?.total ?? admins.length;

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldUser
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
        <h3 className="text-sm font-semibold text-foreground">
          {d.fullAccessHeading(total)}
        </h3>
      </div>

      <p className="text-sm text-muted-foreground">{d.fullAccessHint}</p>

      {admins.length === 0 ? (
        <p role="alert" className="text-sm text-destructive">
          {d.fullAccessNone}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {admins.map((person) => (
            <li key={person.id}>
              <Link
                href={`/staff/${person.id}`}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span>{staffDisplayName(person)}</span>
                {person.isOwner && (
                  <Badge variant="default">{d.fullAccessOwnerBadge}</Badge>
                )}
                {!person.isActive && (
                  <Badge variant="destructive">{dict.common.inactive}</Badge>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
