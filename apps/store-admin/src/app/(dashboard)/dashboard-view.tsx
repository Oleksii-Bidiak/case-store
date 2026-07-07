"use client";

import Link from "next/link";
import { useAdminDashboardControllerGetSummary } from "@/entities/dashboard";
import {
  AdminDashboardStats,
  AdminDashboardStatsSkeleton,
  DashboardCharts,
  DashboardLowStockTable,
  DashboardSectionSkeleton,
  DashboardTopProductsTable,
  NeedsActionWidget,
} from "@/widgets";
import { Button, Separator } from "@/shared/ui";
import { dict } from "@/shared/config";

const timeFormatter = new Intl.DateTimeFormat("uk-UA", {
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Client orchestrator for the admin dashboard. Lives in the app layer (not a
 * widget) so it may compose multiple widgets without a widget→widget lateral
 * import. Fetches the summary once and passes slices down to each widget.
 */
export function DashboardView() {
  const { data, isLoading, isError, dataUpdatedAt } =
    useAdminDashboardControllerGetSummary();

  return (
    <div>
      <section className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.dashboard.heading}
        </h2>
        {data ? (
          <p className="text-xs text-muted-foreground">
            {dict.dashboard.updatedAt(
              timeFormatter.format(new Date(dataUpdatedAt)),
            )}
          </p>
        ) : null}
      </section>

      <Separator className="my-6" />

      {/* Needs-action widget (TASK-248) — self-fetching, independent of the
          summary below, so it surfaces "what needs my attention" at the top. */}
      <NeedsActionWidget />

      <Separator className="my-6" />

      {isLoading ? (
        <>
          <AdminDashboardStatsSkeleton />

          <Separator className="my-6" />

          <DashboardSectionSkeleton className="min-h-[300px]" />

          <Separator className="my-6" />

          <DashboardSectionSkeleton />

          <Separator className="my-6" />

          <DashboardSectionSkeleton />
        </>
      ) : isError || !data ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.dashboard.loadError}
        </p>
      ) : (
        <>
          <AdminDashboardStats summary={data} />

          <Separator className="my-6" />

          <DashboardCharts summary={data} />

          <Separator className="my-6" />

          <DashboardTopProductsTable products={data.products.topProducts} />

          <Separator className="my-6" />

          <DashboardLowStockTable products={data.inventory.lowStockProducts} />
        </>
      )}

      <Separator className="my-6" />

      <section>
        <h3 className="text-lg font-semibold text-foreground">
          {dict.dashboard.quickActions}
        </h3>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/products/new">{dict.dashboard.addProduct}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/orders">{dict.dashboard.viewOrders}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/users">{dict.dashboard.manageUsers}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
