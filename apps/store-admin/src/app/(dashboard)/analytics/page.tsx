import { Suspense } from "react";
import type { Metadata } from "next";
import { AnalyticsSkeleton, AnalyticsView } from "@/widgets";
import { PERM } from "@/entities/permission";
import { PermissionGate } from "@/entities/session";
import { RegistryHeader } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * TASK-692: the report period lives in the query string (`?preset=`, `?from=`,
 * `?to=`) so a report can be sent as a link. A statically prerendered route
 * serves one prerender for every query string (TASK-405), so this renders on
 * request — every admin route sits behind auth, there is nothing to cache.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.analytics.metaTitle,
};

export default function AnalyticsPage() {
  return (
    <div className="flex flex-col gap-4">
      <RegistryHeader
        title={dict.analytics.heading}
        description={dict.analytics.intro}
      />

      {/* `analytics:read` — the same key as the dashboard's figures. The money
          inside (`analytics:revenue`) is cut by the API per report, so it is
          not part of this gate. The view reads the period from the query
          string, so it sits behind a Suspense boundary (TASK-356). */}
      <PermissionGate
        permission={PERM.analyticsRead}
        title={dict.analytics.forbidden}
        hint={dict.analytics.forbiddenHint}
      >
        <Suspense fallback={<AnalyticsSkeleton />}>
          <AnalyticsView />
        </Suspense>
      </PermissionGate>
    </div>
  );
}
