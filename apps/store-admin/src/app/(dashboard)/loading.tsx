import {
  AdminDashboardStatsSkeleton,
  DashboardSectionSkeleton,
} from "@/widgets";
import { Separator } from "@/shared/ui";

/**
 * Route-level loading UI for the dashboard home. Renders inside the
 * `(dashboard)` shell chrome (sidebar + header stay visible) and mirrors the
 * DashboardView loading layout: stats cards + chart/section placeholders, so
 * there is no layout shift when the summary resolves.
 */
export default function Loading() {
  return (
    <div>
      <AdminDashboardStatsSkeleton />

      <Separator className="my-6" />

      <DashboardSectionSkeleton className="min-h-[300px]" />

      <Separator className="my-6" />

      <DashboardSectionSkeleton />

      <Separator className="my-6" />

      <DashboardSectionSkeleton />
    </div>
  );
}
