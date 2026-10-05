import { AuditLogSkeleton } from "@/widgets";
import { RegistryHeader } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * Route-level loading UI for `/audit-log` (canon 1.7): the page's heading plus
 * the page's `<Suspense>` fallback. Without this file the dashboard's skeleton
 * stood in for the log while it loaded.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <RegistryHeader
        title={dict.auditLog.heading}
        description={dict.auditLog.intro}
      />
      <AuditLogSkeleton />
    </div>
  );
}
