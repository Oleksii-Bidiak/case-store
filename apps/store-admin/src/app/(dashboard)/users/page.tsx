import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminUserTable, AdminUserTableSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

/**
 * TASK-405: this table keeps its view state (`?status=`, `?page=`, `?search=`,
 * sort) in the query string. A statically prerendered route serves one and the
 * same prerender for every query string, so a hard load of a filtered URL
 * followed by a query-only `router.replace` re-renders nothing and the controls
 * go dead. Rendering on request makes each of those a real navigation. Every
 * admin route sits behind auth, so there is no static payload worth keeping.
 *
 * CUSTOMERS ONLY SINCE TASK-480. `GET /api/users` has returned nothing but
 * CUSTOMER rows since TASK-476, so the «Створити співробітника» button that
 * TASK-406 put beside this heading now belongs to a screen its result never
 * appears on — it moved to `/staff`, together with the role filter and the
 * per-role empty states, which could only ever have answered «менеджерів ще
 * немає» here no matter how many there were.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.users.metaTitle,
};

export default function UsersPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.users.heading}
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {dict.users.intro}
        </p>
      </div>

      <Suspense fallback={<AdminUserTableSkeleton />}>
        <AdminUserTable />
      </Suspense>
    </div>
  );
}
