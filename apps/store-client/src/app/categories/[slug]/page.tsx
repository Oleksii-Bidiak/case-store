import { Suspense, Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ProductListView,
  ProductListSkeleton,
  SubcategoryChips,
} from "@/widgets";
import { findCategoryPathBySlug } from "@/widgets/product-list/model/catalog-header";
import type { ProductControllerFindAllParams } from "@/entities/product";
import type { CategoryTreeNodeEntity } from "@/shared/api/generated/models";
import { categoryControllerGetCategoryTree } from "@/shared/api/generated/categories/categories";
import { productControllerFindAll } from "@/shared/api/generated/products/products";
import { JsonLd } from "@/shared/ui";
import {
  buildBreadcrumbSchema,
  buildItemListSchema,
} from "@/shared/lib/schema";
import { resolveSeo, toMetadataTitle } from "@/shared/lib/seo";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";
import { SITE_URL, SITE_NAME, dict } from "@/shared/config";

interface CategoryLandingPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/** Take the first value when a query param appears more than once. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Resolve the category's ancestor path by slug from the public tree
 * (server-side). The tree is active-only, so an inactive or unknown slug
 * resolves to null. Null on any fetch failure too — the caller decides
 * between metadata fallback and `notFound()`.
 */
async function resolveCategoryPath(
  slug: string,
): Promise<CategoryTreeNodeEntity[] | null> {
  try {
    const { data } = await categoryControllerGetCategoryTree();
    return findCategoryPathBySlug(data ?? [], slug);
  } catch {
    return null;
  }
}

/**
 * Category landing metadata (TASK-277): the shared precedence chain — the
 * category's own metaTitle/metaDescription (tier 1, admin override) →
 * SeoSettings defaults (tier 2) → category name/description (tier 3) — plus a
 * self-canonical without query params (the filter/page-param canonical policy
 * is TASK-278's remit).
 */
export async function generateMetadata({
  params,
}: CategoryLandingPageProps): Promise<Metadata> {
  const { slug } = await params;

  const [path, seo] = await Promise.all([
    resolveCategoryPath(slug),
    fetchSeoSettings(),
  ]);
  const node = path?.at(-1);

  // Unknown slug: minimal fallback — the page body's own notFound() is what
  // actually produces the 404 response (a 404 route still needs *a* metadata
  // object, mirroring the PDP's catch shape).
  if (!node) {
    return { title: dict.meta.categoriesTitle };
  }

  const seoMeta = resolveSeo({
    settings: seo,
    entityTitle: node.metaTitle,
    entityDescription: node.metaDescription,
    content: { name: node.name, description: node.description },
  });

  return {
    title: toMetadataTitle(seoMeta, {
      settings: seo,
      siteName: SITE_NAME,
      fallback: node.name,
    }),
    description:
      seoMeta.description ?? dict.catalog.categorySubtitle(node.name),
    alternates: { canonical: `${SITE_URL}/categories/${node.slug}` },
  };
}

export default async function CategoryLandingPage({
  params,
  searchParams,
}: CategoryLandingPageProps) {
  const [{ slug }, resolved] = await Promise.all([params, searchParams]);

  const path = await resolveCategoryPath(slug);
  if (!path) {
    // Real HTTP 404 — the category is resolved server-side before the
    // response is built (unlike the PDP's client-fetched soft-404).
    notFound();
  }
  const node = path.at(-1)!;

  // Filters/sort/pagination ride the query string on top of this route, same
  // parsing as /products — but the category itself is locked by the segment.
  const minPrice = first(resolved.minPrice);
  const maxPrice = first(resolved.maxPrice);
  const specs = first(resolved.specs);
  const page = first(resolved.page);

  const initialParams: ProductControllerFindAllParams = {
    categoryId: node.id,
    search: first(resolved.search)?.trim() || undefined,
    sortBy: first(resolved.sortBy) ?? "createdAt",
    sortOrder: first(resolved.sortOrder) ?? "desc",
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    specs: specs || undefined,
    page: page ? Number(page) : 1,
    limit: 20,
    isActive: true,
  };

  // «Головна → [батько →] категорія» — one crumb per tree ancestor, each an
  // ancestor's own landing page (no generic hub crumb).
  const trail = [
    { name: dict.product.breadcrumbHome, href: "/" as string | undefined },
    ...path.slice(0, -1).map((ancestor) => ({
      name: ancestor.name,
      href: `/categories/${ancestor.slug}` as string | undefined,
    })),
    { name: node.name, href: undefined },
  ];

  const schemas = await buildCategoryPageSchemas(path);

  return (
    // eslint-disable-next-line tailwindcss/no-arbitrary-value -- mirrors the grandfathered /products catalog page shell (shared grid must align pixel-for-pixel)
    <div className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 sm:py-8">
      {schemas?.breadcrumb && <JsonLd schema={schemas.breadcrumb} />}
      {schemas?.itemList && <JsonLd schema={schemas.itemList} />}

      {/* Breadcrumbs */}
      <nav
        aria-label={dict.product.breadcrumbAria}
        // eslint-disable-next-line tailwindcss/no-arbitrary-value -- mirrors the grandfathered /products breadcrumb type size
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
      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- mirrors the grandfathered /products title block spacing */}
      <div className="mb-[18px]">
        {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- mirrors the grandfathered /products H1 type size */}
        <h1 className="font-display text-[31px] leading-tight font-bold tracking-tight text-foreground">
          {node.name}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {node.description || dict.catalog.categorySubtitle(node.name)}
        </p>
      </div>

      {/* Direct subcategories — navigation links, not filter toggles */}
      <SubcategoryChips categories={node.children ?? []} />

      <Suspense fallback={<ProductListSkeleton />}>
        <ProductListView
          initialParams={initialParams}
          lockedCategoryId={node.id}
        />
      </Suspense>
    </div>
  );
}

/**
 * Build the BreadcrumbList + ItemList JSON-LD graphs for a category landing
 * page. Each block fails independently (null → omitted) so structured data
 * never blocks the page — mirrors the PDP's buildProductPageSchemas.
 */
async function buildCategoryPageSchemas(
  path: CategoryTreeNodeEntity[],
): Promise<{
  breadcrumb: Record<string, unknown> | null;
  itemList: Record<string, unknown> | null;
} | null> {
  const node = path.at(-1);
  if (!node) return null;

  let breadcrumb: Record<string, unknown> | null = null;
  try {
    breadcrumb = buildBreadcrumbSchema([
      { name: dict.product.breadcrumbHome, item: SITE_URL },
      ...path.map((ancestor) => ({
        name: ancestor.name,
        item: `${SITE_URL}/categories/${ancestor.slug}`,
      })),
    ]);
  } catch {
    breadcrumb = null;
  }

  // One small server-side fetch of the category's first product page, purely
  // for the ItemList (must exist in the initial HTML for crawlers) — the grid
  // itself hydrates client-side via its own query, same split as /products.
  let itemList: Record<string, unknown> | null = null;
  try {
    const { data: products } = await productControllerFindAll({
      categoryId: node.id,
      isActive: true,
      page: 1,
      limit: 20,
    });
    itemList = buildItemListSchema(
      products.map((product) => ({
        name: product.name,
        url: `${SITE_URL}/products/${product.slug}`,
        image: product.primaryImage?.url,
      })),
    );
  } catch {
    itemList = null;
  }

  return { breadcrumb, itemList };
}
