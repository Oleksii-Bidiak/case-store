import { ProductListSkeleton } from "@/widgets";

/**
 * Route-level loading UI for `/categories/[slug]`. Fires on navigation before
 * the page component instantiates; mirrors the page's `<Suspense>` fallback so
 * there is no visual jump.
 */
export default function Loading() {
  return (
    // eslint-disable-next-line tailwindcss/no-arbitrary-value -- mirrors the grandfathered /products catalog page shell (shared grid must align pixel-for-pixel)
    <div className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 sm:py-8">
      <ProductListSkeleton />
    </div>
  );
}
