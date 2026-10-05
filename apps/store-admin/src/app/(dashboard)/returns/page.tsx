import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminReturnTable, AdminReturnTableSkeleton } from "@/widgets";
import { RegistryHeader } from "@/shared/ui";
import { dict } from "@/shared/config";
import { ReturnsPermissionGate } from "./returns-permission-gate";

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
  title: dict.returns.metaTitle,
};

export default function ReturnsPage() {
  return (
    <div className="flex flex-col gap-4">
      {/* Wave 198 (TASK-1056): the registry's header, drawn by the page so it
          stays above the refusal. No «Експорт»: the API has no returns export
          (an API tail). */}
      <RegistryHeader title={dict.returns.heading} />

      {/* TASK-370: `returns:read`, not merely `isStaff`. The heading stays
          outside the gate so a manager without the permission still sees which
          section refused them rather than an unlabelled box. */}
      <ReturnsPermissionGate>
        <Suspense fallback={<AdminReturnTableSkeleton />}>
          <AdminReturnTable />
        </Suspense>
      </ReturnsPermissionGate>
    </div>
  );
}
