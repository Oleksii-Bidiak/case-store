"use client";

import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import {
  DashboardLastOrdersTableSkeleton,
  NeedsActionWidgetSkeleton,
} from "@/widgets";
import { Separator } from "@/shared/ui";
import {
  DashboardHeading,
  DashboardSummarySkeleton,
} from "./dashboard-layout-parts";

/**
 * Route-level loading UI for the dashboard home (TASK-1037, П3; canon 1.7).
 * Renders inside the `(dashboard)` shell chrome (sidebar + header stay visible)
 * with the page's own «Огляд» heading, then skeletons in the layout the page
 * will have FOR THIS SESSION — the same permission checks `DashboardView` makes:
 * needs-action (ten cards with `returns:read`, nine without), the summary
 * (ten stat cards and two charts with `analytics:revenue`), the last orders.
 *
 * A client component for exactly that reason: the shape depends on the
 * session, and a skeleton of the wrong shape reflows the page when it lands.
 */
export default function Loading() {
  const { can } = useAuth();
  const canSeeAnalytics = can(PERM.analyticsRead);

  return (
    <div>
      <DashboardHeading />

      {canSeeAnalytics ? (
        <>
          <Separator className="my-6" />
          <NeedsActionWidgetSkeleton withReturns={can(PERM.returnsRead)} />
          <Separator className="my-6" />
          <DashboardSummarySkeleton withRevenue={can(PERM.analyticsRevenue)} />
        </>
      ) : null}

      {can(PERM.ordersRead) ? (
        <>
          <Separator className="my-6" />
          <DashboardLastOrdersTableSkeleton />
        </>
      ) : null}
    </div>
  );
}
