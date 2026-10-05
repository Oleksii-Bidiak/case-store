import { Skeleton } from "@/shared/ui";
import { ORDER_CARD_CLASS, ORDER_LIST_CLASS } from "./order-card-class";

/**
 * One order card blanked out (AccountOrders.dc.html, list «Скелетон»): the
 * number and the date·count line on the left, a status pill on the right,
 * three 52px thumbnails and the total. The same card shell as `OrderCard`, so
 * nothing jumps when the real cards replace it. Server-compatible.
 */
function OrderCardSkeleton() {
  return (
    <div data-testid="order-card-skeleton" className={ORDER_CARD_CLASS}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4.5 w-48" />
          <Skeleton className="h-3.5 w-32" />
        </div>
        <Skeleton className="h-6 w-36 rounded-full" />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="size-13 rounded-menu" />
          ))}
        </div>
        <Skeleton className="h-7 w-22" />
      </div>
    </div>
  );
}

/** The card list while the current tab's page loads — under the real header and tabs. */
export function OrderCardsSkeleton() {
  return (
    <div aria-hidden="true" className={ORDER_LIST_CLASS}>
      {Array.from({ length: 3 }).map((_, i) => (
        <OrderCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * OrderHistorySkeleton — the whole `/account/orders` content column before the
 * view mounts: `app/account/orders/loading.tsx`, the page's `<Suspense>`
 * fallback and the account shell's own loading branch (TASK-217). The h1 slot
 * at H1_CLASS line heights, the 36px tab list, then three cards. Content-only:
 * the frame is AccountShell. Server-compatible.
 */
export function OrderHistorySkeleton() {
  return (
    <div
      aria-hidden="true"
      data-testid="order-history-skeleton"
      className="flex flex-col gap-5"
    >
      <div className="flex h-9 items-center md:h-10">
        <Skeleton className="h-7 w-56 md:h-8 md:w-72" />
      </div>
      <Skeleton className="h-9 w-80 max-w-full rounded-lg" />
      <div className={ORDER_LIST_CLASS}>
        {Array.from({ length: 3 }).map((_, i) => (
          <OrderCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
