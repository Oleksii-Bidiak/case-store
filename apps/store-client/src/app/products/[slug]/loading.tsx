import { ProductDetailSkeleton } from "@/widgets";

/**
 * Route-level loading UI for `/products/[slug]` (TASK-409, SF-PDP-03/05).
 *
 * Without this file the nearest loading boundary is `app/products/loading.tsx`,
 * so opening a position from the catalogue flashed the CATALOGUE GRID skeleton
 * — a wall of card placeholders — before the detail page appeared. The fallback
 * now matches the page it precedes, and mirrors that page's own `<Suspense>`
 * fallback (same container, same skeleton) so nothing jumps when the real view
 * hydrates.
 *
 * On the slug-redirect path (TASK-285): a loading boundary streams a 200 shell,
 * which is why `page.tsx` used to say this route deliberately has none. That
 * protection was already void — `app/products/loading.tsx` sits ABOVE this
 * segment and wraps it too, which is exactly why the catalogue skeleton showed
 * up here at all. This file changes WHICH fallback renders, not whether one
 * exists. See the note in `page.tsx`.
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <ProductDetailSkeleton />
    </div>
  );
}
