"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
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
  const { data, isPending, isFetching, isError } =
    useProductControllerFindAll(params);

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

      <div className="relative">
        {isFetching && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60"
          >
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        )}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {products.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              // First row (4 cards on desktop) is above the fold — load eagerly for LCP.
              priority={index < 4}
              quickAdd={
                <AddToCartButton
                  productId={product.variantSummary.defaultVariantId}
                  compact
                  outOfStock={!product.variantSummary.defaultInStock}
                  ariaLabel={dict.productCard.quickAddAria(product.name)}
                />
              }
            />
          ))}
        </div>
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
