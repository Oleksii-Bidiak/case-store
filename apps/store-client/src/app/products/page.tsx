import { Suspense, Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ProductListView, ProductListSkeleton } from "@/widgets";
import {
  buildCatalogHeader,
  findCategoryNode,
} from "@/widgets/product-list/model/catalog-header";
import type { ProductControllerFindAllParams } from "@/entities/product";
import type { CategoryTreeNodeEntity } from "@/shared/api/generated/models";
import { categoryControllerGetCategoryTree } from "@/shared/api/generated/categories/categories";
import { JsonLd } from "@/shared/ui";
import { buildBreadcrumbSchema } from "@/shared/lib/schema";
import { resolveSeo, toMetadataTitle } from "@/shared/lib/seo";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";
import { SITE_URL, SITE_NAME, dict } from "@/shared/config";

/** Take the first value when a query param appears more than once. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Resolve the selected category node server-side (for the breadcrumb + title +
 * description + JSON-LD). Uses the public category tree so any node — root or
 * sub-category — resolves. Returns null on any failure so the catalog still
 * renders.
 */
async function resolveCategoryNode(
  id: string,
): Promise<CategoryTreeNodeEntity | null> {
  try {
    const { data } = await categoryControllerGetCategoryTree();
    return findCategoryNode(data ?? [], id);
  } catch {
    return null;
  }
}

/**
 * Category-aware catalog metadata (plan 116 gap 1). For a `?categoryId=` view the
 * title/description are resolved through the shared precedence helper so they are
 * category-specific and SeoSettings-aware instead of the generic "Товари":
 *
 *   SeoSettings defaults (tier 2) → category name/description (tier 3).
 *
 * The category's own `metaTitle`/`metaDescription` admin overrides (tier 1) are
 * not surfaced on the public category tree/detail endpoints yet, so they are not
 * passed here — the entity tier lights up once those columns are exposed
 * publicly (see plan 116 gap 1 / the `Category` schema comment). The unfiltered
 * and keyword-search views keep the static generic metadata.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const resolvedParams = await searchParams;
  const categoryId = first(resolvedParams.categoryId);

  const [node, seo] = await Promise.all([
    categoryId ? resolveCategoryNode(categoryId) : Promise.resolve(null),
    fetchSeoSettings(),
  ]);

  // Category view: category-specific, SeoSettings-aware title/description.
  if (node) {
    const seoMeta = resolveSeo({
      settings: seo,
      content: { name: node.name, description: node.description },
    });
    return {
      title: toMetadataTitle(seoMeta, {
        settings: seo,
        siteName: SITE_NAME,
        fallback: dict.meta.productsTitle,
      }),
      description: seoMeta.description ?? dict.meta.productsDescription,
    };
  }

  // Unfiltered / keyword-search / unknown-category → generic listing metadata,
  // still branded through the same helper so the title carries the store name.
  return {
    title: toMetadataTitle(
      { title: dict.meta.productsTitle, titleAbsolute: false },
      { settings: seo, siteName: SITE_NAME, fallback: dict.meta.productsTitle },
    ),
    description: dict.meta.productsDescription,
  };
}

/**
 * Resolve just the selected category's name (breadcrumb + on-page title). Thin
 * wrapper over `resolveCategoryNode`.
 */
async function resolveCategoryName(id: string): Promise<string | null> {
  return (await resolveCategoryNode(id))?.name ?? null;
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
  const specs = first(resolved.specs);
  const page = first(resolved.page);

  const initialParams: ProductControllerFindAllParams = {
    categoryId,
    search,
    sortBy: first(resolved.sortBy) ?? "createdAt",
    sortOrder: first(resolved.sortOrder) ?? "desc",
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    specs: specs || undefined,
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
