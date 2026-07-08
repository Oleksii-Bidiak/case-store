/**
 * Loading placeholder for the customer-card layout (TASK-252): the main column
 * carries the profile card, a two-cell stat row, and the recent-orders / reviews
 * / coupons / messages section blocks; the sidebar carries the ban control +
 * metadata. Sized to approximate the loaded layout so there's no jump on load.
 */
export function UserDetailSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <div className="h-8 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-48 w-full animate-pulse rounded bg-muted" />
        {/* Stat row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="h-20 w-full animate-pulse rounded bg-muted" />
          <div className="h-20 w-full animate-pulse rounded bg-muted" />
        </div>
        {/* Recent orders + reviews + coupons + messages section blocks */}
        <div className="h-40 w-full animate-pulse rounded bg-muted" />
        <div className="h-32 w-full animate-pulse rounded bg-muted" />
        <div className="h-32 w-full animate-pulse rounded bg-muted" />
        <div className="h-32 w-full animate-pulse rounded bg-muted" />
      </div>
      <div className="flex flex-col gap-6">
        <div className="h-32 w-full animate-pulse rounded bg-muted" />
        <div className="h-40 w-full animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
