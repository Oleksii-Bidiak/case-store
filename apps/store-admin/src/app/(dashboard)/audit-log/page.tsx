import { Suspense } from "react";
import type { Metadata } from "next";
import { AuditLogSkeleton, AuditLogView } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.auditLog.metaTitle,
};

export default function AuditLogPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.auditLog.heading}
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {dict.auditLog.intro}
        </p>
      </div>

      {/* TASK-356: the view reads its filters, page and sort from the query
          string, and `useSearchParams` opts a client component out of static
          prerendering unless it sits behind a boundary. Same shape as the users
          and subscribers pages. */}
      <Suspense fallback={<AuditLogSkeleton />}>
        <AuditLogView />
      </Suspense>
    </div>
  );
}
