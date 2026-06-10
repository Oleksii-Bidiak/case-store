"use client";

import { useProductControllerFindAll } from "@/entities/product";
import { ProductCard } from "@/shared/ui";
import { ProductGridSkeleton } from "./product-grid-skeleton";

/**
 * ProductGrid — renders the latest active products on the homepage.
 * Client Component: consumes the Orval-generated TanStack Query hook.
 */
export function ProductGrid() {
  const { data, isPending, isError } = useProductControllerFindAll({
    sortBy: "createdAt",
    sortOrder: "desc",
    limit: 8,
    isActive: true,
  });

  if (isPending) {
    return <ProductGridSkeleton />;
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Failed to load products. Please try again later.
      </p>
    );
  }

  const products = data?.data ?? [];

  if (products.length === 0) {
    return <p className="text-sm text-muted-foreground">No products yet.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
