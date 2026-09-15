import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { FullAccessPanel, StaffTable, StaffTableSkeleton } from "@/widgets";
import { CreateStaffButton } from "@/features/staff-create";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * «Персонал» — the register of service accounts (TASK-480, plan 181).
 *
 * `force-dynamic` for the same reason every admin list carries it (TASK-405):
 * this table keeps its view state in the query string, and a statically
 * prerendered route serves one prerender for every query string, so a hard load
 * of a filtered URL followed by a query-only `router.replace` re-renders nothing
 * and the controls go dead. Every admin route sits behind auth, so there is no
 * static payload worth keeping.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.staff.metaTitle,
};

export default function StaffPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {dict.staff.heading}
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {dict.staff.intro}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/staff/templates">{dict.staff.templatesNav}</Link>
          </Button>
          <CreateStaffButton />
        </div>
      </div>

      {/* Decision 5: the number of people with full access is not capped, it is
          made visible — permanently, above the list, rather than inferable from
          a filter somebody would have to think to apply. */}
      <Suspense fallback={null}>
        <FullAccessPanel />
      </Suspense>

      <Suspense fallback={<StaffTableSkeleton />}>
        <StaffTable />
      </Suspense>
    </div>
  );
}
