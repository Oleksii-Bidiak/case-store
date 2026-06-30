/**
 * WishlistSkeleton — placeholder grid shown while the wishlist query is in
 * flight (and as the route Suspense fallback). Mirrors the saved-products grid
 * layout to avoid layout shift.
 */
export function WishlistSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
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
  );
}
