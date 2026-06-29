import { ProductDetailSkeleton } from "@/widgets";

/**
 * Route-level loading UI for `/products/[slug]`; mirrors the page's
 * `<Suspense>` fallback so there is no visual jump on navigation.
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <ProductDetailSkeleton />
    </div>
  );
}
