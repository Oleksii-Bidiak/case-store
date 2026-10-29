import { ProductListSkeleton } from "@/widgets/product-list";
import { PROMO_LISTING_LOCKS, PromoScrollAnchor } from "@/widgets/promo";

/**
 * Route-level loading UI for `/promo` (TASK-869). Next nests it inside the
 * segment's `layout.tsx`, which already paints the container, the breadcrumb,
 * the hero, the coupons and the deals heading — so this stands in for the
 * listing alone: the same catalogue shell as the page's own `<Suspense>`
 * fallback (chips row, toolbar, the 268px rail without «Знижки», the 1 / 2 / 4
 * grid). It cannot see `?category=` (a loading boundary gets no searchParams),
 * so «Характеристики» is not reserved here — the same trade `/products` makes.
 *
 * It opens with the scroll anchor, like the page: on a fresh navigation the
 * boundary is the segment Next scrolls to first (TASK-1991).
 */
export default function Loading() {
  return (
    <>
      <PromoScrollAnchor />
      <ProductListSkeleton
        withSidebar
        lockedOnSale={PROMO_LISTING_LOCKS.onSale}
      />
    </>
  );
}
