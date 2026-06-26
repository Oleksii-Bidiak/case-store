"use client";

import Link from "next/link";
import {
  useProductControllerFindAll,
  type ProductControllerFindAllParams,
} from "@/entities/product";
import { ProductCard } from "@/shared/ui";
import { AddToCartButton } from "@/features/add-to-cart";
import { dict } from "@/shared/config";
import { ProductListSkeleton } from "./product-list-skeleton";
import { Pagination } from "./pagination";

interface ProductListProps {
  /** Active filter params (all URL-derived). */
  params: ProductControllerFindAllParams;
  /** Build a pagination href for a given page, preserving filters. */
  buildPageHref: (page: number) => string;
}

/**
 * Renders the paginated product grid for the current filter params, with
 * loading / error / empty states. Data comes from the Orval-generated hook,
 * keyed on `params`, so any filter change refetches automatically.
 */
export function ProductList({ params, buildPageHref }: ProductListProps) {
  const { data, isPending, isError } = useProductControllerFindAll(params);

  if (isPending) {
    return <ProductListSkeleton />;
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.catalog.productsError}
      </p>
    );
  }

  const products = data?.data ?? [];
  const meta = data?.meta;

  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {dict.catalog.emptyHeading}
        </p>
        <Link
          href="/products"
          className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
        >
          {dict.catalog.clearFilters}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {dict.catalog.countFound(meta?.total ?? products.length)}
      </p>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            action={
              <AddToCartButton
                productId={product.id}
                compact
                outOfStock={product.stock === 0}
              />
            }
          />
        ))}
      </div>

      {meta && meta.totalPages > 1 && (
        <Pagination
          currentPage={meta.page}
          totalPages={meta.totalPages}
          buildHref={buildPageHref}
        />
      )}
    </div>
  );
}
