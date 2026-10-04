import { Suspense } from "react";
import type { Metadata } from "next";
import { AuditLogSkeleton, AuditLogView } from "@/widgets";
import { PERM } from "@/entities/permission";
import { PermissionGate } from "@/entities/session";
import { RegistryHeader } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * TASK-405: this table keeps its view state (`?action=`, `?page=`, filters,
 * sort) in the query string. A statically prerendered route serves one and the
 * same prerender for every query string, so a hard load of a filtered URL
 * followed by a query-only `router.replace` re-renders nothing and the controls
 * go dead. Rendering on request makes each of those a real navigation. Every
 * admin route sits behind auth, so there is no static payload worth keeping.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.auditLog.metaTitle,
};

export default function AuditLogPage() {
  return (
    <div className="flex flex-col gap-4">
      {/* Wave 198 (TASK-1068): the registry's header, drawn by the page so it
          stays above the refusal. No «Експорт»: the API has no log export (an
          API tail). */}
      <RegistryHeader
        title={dict.auditLog.heading}
        description={dict.auditLog.intro}
      />

      {/* TASK-639: `audit:read`, not merely `isStaff` — one refusal that
          says who reads the log, instead of the view's own 403 banners. The
          heading stays outside so the refusal is labelled. TASK-356: the view
          reads its state from the query string, so it sits behind a Suspense
          boundary. */}
      <PermissionGate
        permission={PERM.auditRead}
        title={dict.auditLog.forbidden}
        hint={dict.auditLog.forbiddenHint}
      >
        <Suspense fallback={<AuditLogSkeleton />}>
          <AuditLogView />
        </Suspense>
      </PermissionGate>
    </div>
  );
}
