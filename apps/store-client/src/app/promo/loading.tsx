import { ProductListSkeleton } from "@/widgets/product-list";
import { PROMO_LISTING_LOCKS } from "@/widgets/promo";

/**
 * Route-level loading UI for `/promo` (TASK-869). Next nests it inside the
 * segment's `layout.tsx`, which already paints the container, the breadcrumb,
 * the hero, the coupons and the deals heading — so this stands in for the
 * listing alone: the same catalogue shell as the page's own `<Suspense>`
 * fallback (chips row, toolbar, the 268px rail without «Знижки», the 1 / 2 / 4
 * grid). It cannot see `?category=` (a loading boundary gets no searchParams),
 * so «Характеристики» is not reserved here — the same trade `/products` makes.
 */
export default function Loading() {
  return (
    <ProductListSkeleton
      withSidebar
      lockedOnSale={PROMO_LISTING_LOCKS.onSale}
    />
  );
}
