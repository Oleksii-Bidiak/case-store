"use client";

import { Fragment } from "react";
import Link from "next/link";
import { ShieldIcon } from "lucide-react";
import {
  ListStaffRole,
  staffDisplayName,
  useListStaff,
  type StaffUserEntity,
} from "@/entities/staff";
import { dict } from "@/shared/config";

const d = dict.staff;

const STRIP =
  "flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground";

/** «(власник)», «(адміністратор, вимкнено)» — the level in words, lower case. */
function roleNote(person: StaffUserEntity): string {
  const parts: string[] = [
    person.isOwner ? d.fullAccessOwner : d.fullAccessAdmin,
  ];
  if (!person.isActive) parts.push(d.fullAccessOff);
  return `(${parts.join(", ")})`;
}

/**
 * «Повний доступ мають 2 особи: Олександр Коваленко (власник), Олена Гриценко
 * (адміністратор).» — one standing line above the register (plan 181,
 * decision 5; StaffProposal С1).
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
 * with the names after it answers that every time the register is opened; a
 * cap answers it never. So the strip got quieter in wave 198 (one muted line
 * instead of a bordered panel with a paragraph), but it still NAMES them.
 *
 * ## Why this is a separate query from the table's
 *
 * The table is paginated, searched and filtered by the operator, so "who has full
 * access" would be a different answer on every page and would vanish the moment
 * somebody typed in the search box — the strip has to be true regardless of what
 * the list below it is currently showing. One narrow request (`role=ADMIN`)
 * answers it; React Query keeps it under its own key.
 *
 * DEACTIVATED ADMINS ARE COUNTED, deliberately: an account that cannot sign in
 * today is one status toggle away from full access tomorrow, and the audit
 * question this strip exists for is "who could" rather than "who is online". The
 * note after the name says which are switched off.
 */
export function FullAccessPanel() {
  const { data, isLoading, isError } = useListStaff({
    role: ListStaffRole.ADMIN,
    limit: 100,
  });

  if (isLoading) {
    return (
      <div className={STRIP} aria-busy="true">
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>
    );
  }

  if (isError) {
    return (
      <p role="alert" className={`${STRIP} text-destructive`}>
        {d.fullAccessLoadError}
      </p>
    );
  }

  const admins = data?.data ?? [];
  const total = data?.meta?.total ?? admins.length;

  if (admins.length === 0) {
    return (
      <p role="alert" className={`${STRIP} text-destructive`}>
        {d.fullAccessNone}
      </p>
    );
  }

  return (
    <p data-slot="full-access-strip" className={STRIP}>
      <ShieldIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">
        <span className="font-medium text-foreground">
          {d.fullAccessHeading(total)}
        </span>
        {": "}
        {admins.map((person, index) => (
          <Fragment key={person.id}>
            {index > 0 ? ", " : null}
            <Link
              href={`/staff/${person.id}`}
              className="rounded-xs text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {staffDisplayName(person)}
            </Link>
            <span>{` ${roleNote(person)}`}</span>
          </Fragment>
        ))}
        {"."}
      </span>
    </p>
  );
}
