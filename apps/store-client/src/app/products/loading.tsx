import { ProductListSkeleton } from "@/widgets";

/**
 * Route-level loading UI for `/products`. Fires on navigation before the page
 * component instantiates; mirrors the page's `<Suspense>` fallback so there is
 * no visual jump.
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <ProductListSkeleton />
    </div>
  );
}
