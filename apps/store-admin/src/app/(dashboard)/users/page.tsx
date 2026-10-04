import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminUserTable, AdminUserTableSkeleton } from "@/widgets";
import { RegistryHeader } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * «Клієнти» (до хвилі 198 у меню — «Користувачі»; одна назва всюди — рішення
 * власника 2026-09-30, TASK-1058).
 *
 * TASK-405: this table keeps its view state (`?isActive=`, `?page=`,
 * `?search=`, sort) in the query string. A statically prerendered route serves
 * one and the same prerender for every query string, so a hard load of a
 * filtered URL followed by a query-only `router.replace` re-renders nothing and
 * the controls go dead. Rendering on request makes each of those a real
 * navigation. Every admin route sits behind auth, so there is no static payload
 * worth keeping.
 *
 * CUSTOMERS ONLY SINCE TASK-480 — hiring lives on `/staff`, and the intro says
 * so. No «Експорт»: the API has no customer export (an API tail).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.users.metaTitle,
};

export default function UsersPage() {
  return (
    <div className="flex flex-col gap-4">
      <RegistryHeader
        title={dict.users.heading}
        description={dict.users.intro}
      />

      <Suspense fallback={<AdminUserTableSkeleton />}>
        <AdminUserTable />
      </Suspense>
    </div>
  );
}
