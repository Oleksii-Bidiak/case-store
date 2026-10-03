import {
  AdminDashboardStatsSkeleton,
  DashboardChartsSkeleton,
  DashboardSectionSkeleton,
} from "@/widgets";
import { Separator } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * The dashboard's «Огляд» heading row — one markup for the loaded page and its
 * route-level loading UI (TASK-1037, П3), so the heading does not jump or
 * vanish while the page streams in.
 */
export function DashboardHeading({ updatedAt }: { updatedAt?: string }) {
  return (
    <section className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
        {dict.dashboard.heading}
      </h2>
      {updatedAt ? (
        <p className="text-xs text-muted-foreground">
          {dict.dashboard.updatedAt(updatedAt)}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Placeholder for everything the summary feeds — stat cards, the two charts,
 * top products and low stock — in the loaded layout (TASK-1037, П3). Ten stat
 * cards and two charts with `analytics:revenue`, five and one without (TASK-684).
 */
export function DashboardSummarySkeleton({
  withRevenue,
}: {
  withRevenue: boolean;
}) {
  return (
    <>
      <AdminDashboardStatsSkeleton withRevenue={withRevenue} />

      <Separator className="my-6" />

      <DashboardChartsSkeleton withRevenue={withRevenue} />

      <Separator className="my-6" />

      <DashboardSectionSkeleton rows={5} />

      <Separator className="my-6" />

      <DashboardSectionSkeleton rows={5} />
    </>
  );
}
