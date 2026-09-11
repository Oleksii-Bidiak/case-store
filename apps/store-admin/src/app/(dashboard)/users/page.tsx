import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminUserTable, AdminUserTableSkeleton } from "@/widgets";
import { CreateStaffButton } from "@/features/user-create";
import { dict } from "@/shared/config";

/**
 * TASK-405: this table keeps its view state (`?status=`, `?page=`, `?search=`,
 * sort) in the query string. A statically prerendered route serves one and the
 * same prerender for every query string, so a hard load of a filtered URL
 * followed by a query-only `router.replace` re-renders nothing and the controls
 * go dead. Rendering on request makes each of those a real navigation. Every
 * admin route sits behind auth, so there is no static payload worth keeping.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.users.metaTitle,
};

export default function UsersPage() {
  return (
    <div className="flex flex-col gap-6">
      {/* TASK-406: «Створити співробітника» is the primary action of this
          screen, so it sits next to the heading. Inside the table toolbar — its
          previous home — the owner never found it and reported that hiring a
          manager was impossible. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {dict.users.heading}
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {dict.users.createHint}
          </p>
        </div>
        <CreateStaffButton />
      </div>

      <Suspense fallback={<AdminUserTableSkeleton />}>
        <AdminUserTable />
      </Suspense>
    </div>
  );
}
