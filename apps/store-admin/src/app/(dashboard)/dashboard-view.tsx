"use client";

import Link from "next/link";
import { useAdminDashboardControllerGetSummary } from "@/entities/dashboard";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import {
  AdminDashboardStats,
  AdminDashboardStatsError,
  DashboardCharts,
  DashboardLastOrdersTable,
  DashboardLowStockTable,
  DashboardTopProductsTable,
  DashboardTrafficCard,
  NeedsActionWidget,
} from "@/widgets";
import { Button, Separator } from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatTime } from "@/shared/lib";
import {
  DashboardHeading,
  DashboardSummarySkeleton,
} from "./dashboard-layout-parts";

/**
 * Client orchestrator for the admin dashboard. Lives in the app layer (not a
 * widget) so it may compose multiple widgets without a widget→widget lateral
 * import. Fetches the summary once and passes slices down to each widget.
 *
 * TASK-334 — the dashboard is every staff member's landing page, so the PAGE is
 * ungated while its CONTENT is not. Revenue, AOV, repeat-buyer rate and the
 * customer counters all come from `/admin/dashboard/summary`, which the server
 * guards with `analytics:read`; the last-orders table needs `orders:read`.
 * Without those grants the fetches would be guaranteed 403s, so they are not
 * issued at all and the sections simply do not render — a content manager gets a
 * short, honest dashboard rather than a wall of error banners.
 *
 * The gating here is presentation only. `analytics:read` is enforced by
 * PermissionGuard on the endpoint; if this component were wrong, the data would
 * still be refused.
 *
 * Wave 198 (TASK-1037): every block that fails says so with «Повторити» that
 * re-asks its own request; the loading placeholders have the loaded layout.
 */
export function DashboardView() {
  const { can } = useAuth();

  const canSeeAnalytics = can(PERM.analyticsRead);
  const canSeeOrders = can(PERM.ordersRead);
  const canSeeCustomers = can(PERM.customersRead);
  const canWriteProducts = can(PERM.productsWrite);
  // «Усі з низьким залишком →» opens the product list, which needs its own right.
  const canReadProducts = can(PERM.productsRead);

  const { data, isLoading, isError, isFetching, refetch, dataUpdatedAt } =
    useAdminDashboardControllerGetSummary({
      query: { enabled: canSeeAnalytics },
    });

  const hasQuickActions = canWriteProducts || canSeeOrders || canSeeCustomers;

  return (
    <div>
      <DashboardHeading
        updatedAt={
          canSeeAnalytics && data ? formatTime(dataUpdatedAt) : undefined
        }
      />

      {canSeeAnalytics && (
        <>
          <Separator className="my-6" />

          {/* Needs-action widget (TASK-248) — self-fetching, independent of the
              summary below, so it surfaces "what needs my attention" at the top. */}
          <NeedsActionWidget />

          <Separator className="my-6" />

          {isLoading ? (
            <DashboardSummarySkeleton
              withRevenue={can(PERM.analyticsRevenue)}
            />
          ) : isError || !data ? (
            <AdminDashboardStatsError
              onRetry={() => void refetch()}
              isRetrying={isFetching}
            />
          ) : (
            <>
              <AdminDashboardStats summary={data} />

              <Separator className="my-6" />

              <DashboardCharts summary={data} />

              <Separator className="my-6" />

              <DashboardTopProductsTable
                products={data.products.topProducts}
                showsRevenue={data.revenue !== undefined}
              />

              <Separator className="my-6" />

              <DashboardLowStockTable
                products={data.inventory.lowStockProducts}
                showAllLink={canReadProducts}
              />
            </>
          )}
        </>
      )}

      {canSeeOrders && (
        <>
          <Separator className="my-6" />

          {/* Last orders (TASK-249) — self-fetching, independent of the summary
              fetch (same pattern as NeedsActionWidget); manages its own loading /
              error / empty state, so it renders even if the summary above fails. */}
          <DashboardLastOrdersTable />
        </>
      )}

      {canSeeAnalytics && (
        <>
          <Separator className="my-6" />

          {/* Traffic card (TASK-262) — pure outbound navigation to Umami's own UI,
              not a summary-fetch metric, so it renders unconditionally for anyone
              who may read analytics at all. */}
          <DashboardTrafficCard />
        </>
      )}

      {hasQuickActions && (
        <>
          <Separator className="my-6" />

          <section>
            <h3 className="text-lg font-semibold text-foreground">
              {dict.dashboard.quickActions}
            </h3>
            <div className="mt-4 flex flex-wrap gap-3">
              {canWriteProducts && (
                <Button asChild>
                  <Link href="/products/new">{dict.dashboard.addProduct}</Link>
                </Button>
              )}
              {canSeeOrders && (
                <Button asChild variant="outline">
                  <Link href="/orders">{dict.dashboard.viewOrders}</Link>
                </Button>
              )}
              {canSeeCustomers && (
                <Button asChild variant="outline">
                  <Link href="/users">{dict.dashboard.manageUsers}</Link>
                </Button>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
