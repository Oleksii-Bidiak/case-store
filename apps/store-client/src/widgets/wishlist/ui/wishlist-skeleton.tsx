import { Skeleton } from "@/shared/ui";
import { PRODUCT_GRID_CLASS } from "@/shared/config/product-grid";

/**
 * WishlistSkeleton — placeholder shown while the wishlist query is in flight
 * (and as the `/wishlist` route Suspense fallback).
 *
 * It mirrors `WishlistView` (TASK-1300, Д3-2): the head row, the toolbar row,
 * the same rail + content split on `lg`, and a card grid with the same
 * `PRODUCT_GRID_CLASS` as the real one, so swapping placeholders for cards
 * never changes the column count (TASK-415).
 */
export function WishlistSkeleton() {
  return (
    <div>
      {/* Head (TASK-869): breadcrumb; h1 + count over the sub-line on the
          left, «Додати все в кошик · N» (44px pill) on the right. Heights
          are the real line boxes — text-sm 20px, H1_CLASS 36px / 40px from
          md. Then the toolbar: «Фільтри» below `lg`, sort + view (44px). */}
      <div aria-hidden="true">
        <Skeleton className="mb-4.5 h-5 w-44" />
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-9 w-40 max-w-full md:h-10 md:w-48" />
            <Skeleton className="h-5 w-72 max-w-full" />
          </div>
          <Skeleton className="h-11 w-60 rounded-full" />
        </div>
        <div className="mb-5 flex flex-wrap items-center gap-2 sm:gap-3">
          <Skeleton className="h-11 w-29 rounded-xl lg:hidden" />
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Skeleton className="h-11 w-36 rounded-xl sm:w-60" />
            <Skeleton className="h-11 w-11 rounded-xl sm:w-30" />
          </div>
        </div>
      </div>
      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- same fixed+fluid split as WishlistView, which has no grid-cols-N equivalent */}
      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[268px_1fr]">
        {/* Rail: the device panel, then the filter cards — without it the
            content column would be full-width here and narrow once the real
            rail renders. */}
        <div aria-hidden="true" className="hidden flex-col gap-3.5 lg:flex">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
        <div className="min-w-0">
          {/* The shared grid of WishlistView; any drift is a visible reflow. */}
          <div className={PRODUCT_GRID_CLASS}>
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="flex flex-col overflow-hidden rounded-card border border-border bg-card shadow-card"
              >
                <Skeleton className="aspect-square w-full rounded-none" />
                {/* Title (two lines) and price — the card's `p-4 gap-2`. */}
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="mt-auto h-7 w-20" />
                </div>
                {/* Action block: stock line, then «Купити» + heart (40px). */}
                <div className="flex flex-col gap-2 px-4 pb-4">
                  <Skeleton className="h-4 w-24" />
                  <div className="flex gap-2">
                    <Skeleton className="h-10 flex-1" />
                    <Skeleton className="h-10 w-10.5 shrink-0 rounded-lg" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
