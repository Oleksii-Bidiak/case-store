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
    <div className="flex flex-col gap-6">
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- same fixed+fluid split as WishlistView, which has no grid-cols-N equivalent */}
      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[268px_1fr]">
        {/* Desktop filters sidebar placeholder — without it the content column
            would be full-width here and narrow once the real toolbar renders. */}
        <div className="hidden animate-pulse rounded-2xl bg-muted lg:block lg:h-96" />
        <div className="min-w-0">
          {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- byte-identical to the WishlistView card grid; any drift is a visible reflow */}
          <div className="grid grid-cols-1 items-stretch gap-[18px] min-[390px]:grid-cols-2 lg:grid-cols-4">
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
