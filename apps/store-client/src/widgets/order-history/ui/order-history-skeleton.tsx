import { dict, H1_CLASS } from "@/shared/config";
import { Skeleton } from "@/shared/ui";
import { ORDER_TABS } from "../model/order-history-params";
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
 * fallback and the account shell's own loading branch (TASK-217).
 *
 * As AccountOrders.dc.html draws it: the real h1 and the real tab labels —
 * neither needs data — with only the counters and the cards blanked out. The
 * tabs are a static copy of `TabsList`, none of them active: the selected tab
 * lives in `?status=`, which a server-rendered skeleton does not read.
 * Content-only: the frame is AccountShell. Server-compatible.
 */
export function OrderHistorySkeleton() {
  return (
    <div data-testid="order-history-skeleton" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
        <h1 className={`${H1_CLASS} text-foreground`}>
          {dict.orderHistory.title}
        </h1>
      </div>
      <div aria-hidden="true" className="flex flex-col gap-5">
        <div className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
          <div
            data-testid="order-tabs-skeleton"
            className="inline-flex h-9 w-fit items-center rounded-lg bg-muted p-1 text-muted-foreground"
          >
            {ORDER_TABS.map((key) => (
              <span
                key={key}
                className="inline-flex flex-none items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap"
              >
                {dict.orderHistory.tabs[key]}
                <Skeleton className="h-3 w-3.5" />
              </span>
            ))}
          </div>
        </div>
        <div className={ORDER_LIST_CLASS}>
          {Array.from({ length: 3 }).map((_, i) => (
            <OrderCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
