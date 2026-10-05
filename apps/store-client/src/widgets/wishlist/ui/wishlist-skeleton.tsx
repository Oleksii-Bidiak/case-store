import { Skeleton } from "@/shared/ui";

/**
 * WishlistSkeleton — placeholder shown while the wishlist query is in flight
 * (and as the `/wishlist` route Suspense fallback).
 *
 * It mirrors `WishlistView`: the same sidebar + content split on `lg`, and a
 * card grid whose class string is byte-identical to the real one, so swapping
 * placeholders for cards never changes the column count (TASK-415). Before that
 * the fallback drew an `sm:2 / md:3 / lg:4` ladder against a `1 / 2 / 4` grid
 * and the page re-flowed on every load.
 */
export function WishlistSkeleton() {
  return (
    <div>
      {/* The header of the loaded list (TASK-869): breadcrumb, title + count,
          and the toolbar on the same wrapping row. It used to be one 32px bar
          with a 24px gap, so the rail and the grid started 68px too high on a
          desktop and 184px too high on a phone, where the toolbar wraps under
          the title onto two rows. Heights are the real line boxes (text-sm
          20px, H1_CLASS 36px / 40px from md, 44px controls, the 54px view
          toggle); widths are the real controls' at 390 and 1440, so the row
          wraps at the same widths the real one does. */}
      <div aria-hidden="true">
        <Skeleton className="mb-4.5 h-5 w-44" />
        <div className="mb-4.5 flex flex-wrap items-end justify-between gap-5">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-56 max-w-full md:h-10 md:w-68" />
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Skeleton className="h-11 w-29 rounded-xl lg:hidden" />
            <Skeleton className="hidden h-13.5 w-25.5 rounded-xl lg:block" />
            <Skeleton className="h-11 w-46 rounded-xl sm:w-74" />
            <Skeleton className="h-11 w-43 rounded-xl" />
          </div>
        </div>
      </div>
      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- same fixed+fluid split as WishlistView, which has no grid-cols-N equivalent */}
      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[268px_1fr]">
        {/* Desktop filters sidebar placeholder — without it the content column
            would be full-width here and narrow once the real toolbar renders. */}
        <div className="hidden animate-pulse rounded-2xl bg-muted lg:block lg:h-96" />
        <div className="min-w-0">
          {/* Byte-identical to the WishlistView card grid; any drift is a visible reflow. */}
          <div className="grid grid-cols-1 items-stretch gap-4 md:gap-6 min-[390px]:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
              >
                <div className="aspect-square w-full animate-pulse bg-muted" />
                <div className="flex flex-col gap-3 p-4">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-5 w-1/3 animate-pulse rounded bg-muted" />
                  <div className="h-9 w-full animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
