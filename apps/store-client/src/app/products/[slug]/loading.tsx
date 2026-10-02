import { ProductDetailSkeleton } from "@/widgets";
import { PAGE_CONTAINER } from "@/shared/config";

/**
 * Route-level loading UI for `/products/[slug]` (TASK-409, SF-PDP-02/03/05).
 *
 * The fallback matches the page it precedes, and mirrors that page's own
 * `<Suspense>` fallback (same container, same skeleton) so nothing jumps when
 * the real view hydrates.
 *
 * This is the ONLY loading boundary on the PDP path (TASK-832). The catalogue's
 * `loading.tsx` used to sit one segment up, at `app/products/loading.tsx`, and
 * Next prefetches a dynamic route only "layout to first loading boundary" — so
 * the shell cached for a product link was the CATALOGUE grid, and it still
 * flashed now and then even after this file existed. The listing's boundary
 * now lives in the `app/products/(catalog)` route group, which wraps `/products`
 * alone. `loading.test.tsx` pins that no ancestor boundary comes back.
 *
 * A boundary streams its shell with a 200 before the page below it settles, so
 * the page alone could never answer a dead slug with 404 or a renamed one with
 * 308 (TASK-285/874). `[slug]/layout.tsx` sits ABOVE this boundary and decides
 * both before the shell is flushed — see its note.
 */
export default function Loading() {
  return (
    <div className={`${PAGE_CONTAINER} py-8`}>
      <ProductDetailSkeleton />
    </div>
  );
}
