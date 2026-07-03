import { Suspense, Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ProductListView, ProductListSkeleton } from "@/widgets";
import {
  buildCatalogHeader,
  findCategoryName,
} from "@/widgets/product-list/model/catalog-header";
import type { ProductControllerFindAllParams } from "@/entities/product";
import { categoryControllerGetCategoryTree } from "@/shared/api/generated/categories/categories";
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

/**
 * Resolve the selected category's name server-side (for the breadcrumb + title +
 * JSON-LD). Uses the public category tree so any node — root or sub-category —
 * resolves. Returns null on any failure so the catalog still renders.
 */
async function resolveCategoryName(id: string): Promise<string | null> {
  try {
    const { data } = await categoryControllerGetCategoryTree();
    return findCategoryName(data ?? [], id);
  } catch {
    return null;
  }
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolved = await searchParams;

  const categoryId = first(resolved.categoryId);
  const search = first(resolved.search)?.trim() || undefined;
  const minPrice = first(resolved.minPrice);
  const maxPrice = first(resolved.maxPrice);
  const page = first(resolved.page);

  const initialParams: ProductControllerFindAllParams = {
    categoryId,
    search,
    sortBy: first(resolved.sortBy) ?? "createdAt",
    sortOrder: first(resolved.sortOrder) ?? "desc",
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    page: page ? Number(page) : 1,
    limit: 20,
    isActive: true,
  };

  // Category-scoped catalog: resolve the name so the breadcrumb reveals the
  // categories hub + the specific category (and the title matches it).
  const categoryName = categoryId
    ? await resolveCategoryName(categoryId)
    : null;

  const { trail, title, subtitle, currentPath } = buildCatalogHeader({
    categoryId,
    categoryName,
    search,
  });

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 sm:py-8">
      <JsonLd
        schema={buildBreadcrumbSchema(
          trail.map((crumb) => ({
            name: crumb.name,
            item: `${SITE_URL}${crumb.href ?? currentPath}`,
          })),
        )}
      />

      {/* Breadcrumbs */}
      <nav
        aria-label={dict.product.breadcrumbAria}
        className="mb-3.5 flex flex-wrap items-center gap-2.5 text-[13.5px] text-muted-foreground"
      >
        {trail.map((crumb, i) => {
          const isLast = i === trail.length - 1;
          return (
            <Fragment key={`${crumb.name}-${i}`}>
              {i > 0 && (
                <span aria-hidden="true" className="opacity-50">
                  ›
                </span>
              )}
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="transition-colors hover:text-foreground"
                >
                  {crumb.name}
                </Link>
              ) : (
                <span
                  className={isLast ? "font-medium text-foreground" : undefined}
                >
                  {crumb.name}
                </span>
              )}
            </Fragment>
          );
        })}
      </nav>

      {/* Title */}
      <div className="mb-[18px]">
        <h1 className="font-display text-[31px] leading-tight font-bold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {subtitle}
        </p>
      </div>

      <Suspense fallback={<ProductListSkeleton />}>
        <ProductListView initialParams={initialParams} />
      </Suspense>
    </div>
  );
}
