import { Suspense } from "react";
import type { Metadata } from "next";
import { ProductListView, ProductListSkeleton } from "@/widgets";
import type { ProductControllerFindAllParams } from "@/entities/product";

export const metadata: Metadata = {
  title: "Products | MobileStore",
  description:
    "Browse all mobile accessories — filter by category, price, and keyword, and sort to find exactly what you need.",
};

/** Take the first value when a query param appears more than once. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolved = await searchParams;

  const minPrice = first(resolved.minPrice);
  const maxPrice = first(resolved.maxPrice);
  const page = first(resolved.page);

  const initialParams: ProductControllerFindAllParams = {
    categoryId: first(resolved.categoryId),
    search: first(resolved.search),
    sortBy: first(resolved.sortBy) ?? "createdAt",
    sortOrder: first(resolved.sortOrder) ?? "desc",
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    page: page ? Number(page) : 1,
    limit: 20,
    isActive: true,
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground">
        All Products
      </h1>
      <Suspense fallback={<ProductListSkeleton />}>
        <ProductListView initialParams={initialParams} />
      </Suspense>
    </div>
  );
}
