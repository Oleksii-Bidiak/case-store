import { Skeleton } from "@/shared/ui";

/**
 * OrderDetailSkeleton — `/account/orders/[id]` before the order lands
 * (TASK-217, AccountOrders.dc.html detail «Скелетон»): the back link, the h1
 * slot at H1_CLASS line heights with a 280×36 bar, the 180×18 date line, the
 * 84px timeline card, then the two columns — 300px of items beside a 220px
 * summary from `xl`, stacked below it.
 *
 * Content-only, like every skeleton under the account layout: the frame is
 * AccountShell. The same component is `[id]/loading.tsx`, the shell's own
 * loading branch on this route and the view's loading branch. The payment
 * panel is not reserved — a cash-on-delivery order has none. Server-compatible.
 */
export function OrderDetailSkeleton() {
  return (
    <div
      aria-hidden="true"
      data-testid="order-detail-skeleton"
      className="flex flex-col gap-5"
    >
      <Skeleton className="h-5 w-36" />
      <div className="flex flex-col gap-2.5">
        <div className="flex h-9 items-center md:h-10">
          <Skeleton className="h-9 w-70 max-w-full" />
        </div>
        <Skeleton className="h-4.5 w-45" />
      </div>
      <Skeleton className="h-21 w-full rounded-card" />
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <Skeleton className="h-75 w-full rounded-card xl:min-w-0 xl:flex-1" />
        <Skeleton className="h-55 w-full rounded-card xl:w-80 xl:shrink-0" />
      </div>
    </div>
  );
}
