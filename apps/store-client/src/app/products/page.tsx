import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ProductListView, ProductListSkeleton } from "@/widgets";
import type { ProductControllerFindAllParams } from "@/entities/product";
import { JsonLd } from "@/shared/ui";
import { buildBreadcrumbSchema } from "@/shared/lib/schema";
import { SITE_URL, dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.productsTitle,
  description: dict.meta.productsDescription,
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
    <div className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 sm:py-8">
      <JsonLd
        schema={buildBreadcrumbSchema([
          { name: dict.product.breadcrumbHome, item: SITE_URL },
          {
            name: dict.product.breadcrumbProducts,
            item: `${SITE_URL}/products`,
          },
        ])}
      />

      {/* Breadcrumbs */}
      <nav
        aria-label={dict.product.breadcrumbAria}
        className="mb-3.5 flex flex-wrap items-center gap-2.5 text-[13.5px] text-muted-foreground"
      >
        <Link href="/" className="transition-colors hover:text-foreground">
          {dict.catalog.breadcrumbHome}
        </Link>
        <span aria-hidden="true" className="opacity-50">
          ›
        </span>
        <span className="font-medium text-foreground">
          {dict.catalog.breadcrumbProducts}
        </span>
      </nav>

      {/* Title */}
      <div className="mb-[18px]">
        <h1 className="font-display text-[31px] leading-tight font-bold tracking-tight text-foreground">
          {dict.catalog.allProducts}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {dict.catalog.allProductsSubtitle}
        </p>
      </div>

      <Suspense fallback={<ProductListSkeleton />}>
        <ProductListView initialParams={initialParams} />
      </Suspense>
    </div>
  );
}
