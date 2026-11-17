import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AnalyticsSkeleton, MoneyFlowEntriesView } from "@/widgets";
import { RegistryHeader } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * TASK-2395: the money-flow register. Period, kind and page live in the query
 * string (a summary row on /analytics links here with its kind), so this
 * renders on request, like /analytics (TASK-405).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.analytics.moneyFlowEntriesMetaTitle,
};

export default function MoneyFlowEntriesPage() {
  return (
    <div className="flex flex-col gap-4">
      <RegistryHeader
        title={dict.analytics.moneyFlowEntriesHeading}
        description={dict.analytics.moneyFlowEntriesIntro}
        actions={
          <Link
            href="/analytics"
            className="rounded-sm text-sm font-medium text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {dict.analytics.moneyFlowBack}
          </Link>
        }
      />

      {/* `analytics:read`, then `analytics:revenue` AND `payments:read` — the
          gate is inside the view so the refusal is the analytics page's own
          pattern. The view reads the URL, hence the Suspense (TASK-356). */}
      <Suspense fallback={<AnalyticsSkeleton />}>
        <MoneyFlowEntriesView />
      </Suspense>
    </div>
  );
}
