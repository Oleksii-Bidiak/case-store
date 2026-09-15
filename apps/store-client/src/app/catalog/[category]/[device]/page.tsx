import { Fragment, Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ProductListView, ProductListSkeleton } from "@/widgets";
import { findCategoryPathBySlug } from "@/widgets/product-list/model/catalog-header";
import type { ProductControllerFindAllParams } from "@/entities/product";
import type {
  CategoryTreeNodeEntity,
  CompatLandingDetailEntity,
} from "@/shared/api/generated/models";
import { catalogLandingControllerFindCompatPage } from "@/shared/api/generated/catalog/catalog";
import { categoryControllerGetCategoryTree } from "@/shared/api/generated/categories/categories";
import { productControllerFindAll } from "@/shared/api/generated/products/products";
import { JsonLd } from "@/shared/ui";
import {
  buildBreadcrumbSchema,
  buildItemListSchema,
} from "@/shared/lib/schema";
import {
  buildListingMetadata,
  buildOgImages,
  resolveSeo,
  resolveSiteName,
  toMetadataTitle,
  type ListingFilterParams,
} from "@/shared/lib/seo";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";
import { resolveSlugRedirect } from "@/shared/lib/slug-redirect";
import { SITE_URL, dict } from "@/shared/config";

/**
 * `/catalog/<категорія>/<модель>` — the compatibility landing pages (TASK-490,
 * plan 182 F3 / owner decision B-10 §5). «Чохли для iPhone 15 Pro».
 *
 * ── Why exactly one dimension has a pretty URL ──────────────────────────────
 * Compatibility is how the query is actually phrased, so it — and nothing else —
 * gets an address. Every other facet stays a query parameter on top of this
 * route, `noindex` and canonicalised back onto the category. That is the
 * deliberate line against a farm of hundreds of near-identical, mostly empty
 * pages, and it is the same limit Rozetka and Allo hold: their pretty URLs carry
 * compatibility and manufacturer, not every combination.
 *
 * ── Why a pair with no products must 404 ────────────────────────────────────
 * An indexed URL that promises «Чохли для iPhone 15 Pro» and renders an empty
 * grid is worse than no URL: it is a thin page the crawler learns to distrust
 * and a dead end the shopper arrived at from search. The API decides — its 404
 * IS the "this page does not exist" verdict, computed over the very slice this
 * page will list, so the two cannot disagree.
 *
 * ── No `loading.tsx`, on purpose ────────────────────────────────────────────
 * Same reason as `/categories/[slug]`: a route-level loading boundary starts
 * streaming a 200 shell before `notFound()`/`permanentRedirect()` can set the
 * status, which silently turns every 404 here into a soft one. The in-page
 * `<Suspense>` skeleton below covers the grid-loading UX instead.
 *
 * ── No legacy-uuid 308 ──────────────────────────────────────────────────────
 * `resolveLegacyCatalogParams` is deliberately NOT wired in here, unlike the
 * three listing routes: this route is new in TASK-490, so no pre-TASK-420 URL
 * has ever pointed at it and there is no uuid-shaped history to redirect from.
 */

interface CompatLandingPageProps {
  params: Promise<{ category: string; device: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/** Take the first value when a query param appears more than once. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Did this request fail because the resource is absent, or because the API is? */
function isNotFound(error: unknown): boolean {
  return (
    (error as { response?: { status?: number } } | undefined)?.response
      ?.status === 404
  );
}

/**
 * Resolve the (category × device model) pair, or null when there is no such
 * page — an unknown/deactivated category, an unknown/deactivated model, or a
 * real pair with nothing visible in it.
 *
 * Only a 404 becomes `null`. Anything else (the API is down, a 500) is
 * RETHROWN, so an outage renders the error boundary instead of quietly
 * de-indexing the whole `/catalog` tree behind a wall of 404s — the failure mode
 * a blanket `catch` would have produced.
 */
async function resolveCompatPage(
  categorySlug: string,
  deviceSlug: string,
): Promise<CompatLandingDetailEntity | null> {
  try {
    const { data } = await catalogLandingControllerFindCompatPage(
      categorySlug,
      deviceSlug,
    );
    return data;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/**
 * The category's ancestor path from the public (active-only) tree, for the
 * breadcrumb trail. Null on any failure — the crumbs degrade to the pair itself
 * rather than taking the page down with them.
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

/** The eight listing filter params, read from the query string. */
function readFilters(resolved: {
  [key: string]: string | string[] | undefined;
}): ListingFilterParams {
  return {
    search: first(resolved.search)?.trim() || undefined,
    minPrice: first(resolved.minPrice),
    maxPrice: first(resolved.maxPrice),
    specs: first(resolved.specs),
    brand: first(resolved.brand),
    // `?device=` is NOT supplied by this route — the segment is. Its presence in
    // the QUERY here can therefore only be a hand-edited or stale URL naming a
    // second, contradicting model, which is precisely a reason to noindex.
    device: first(resolved.device),
    onSale: first(resolved.onSale),
    inStock: first(resolved.inStock),
  };
}

/**
 * Metadata for a compatibility landing page.
 *
 * Title/description precedence is the shared `resolveSeo` chain with the DEVICE
 * MODEL as the entity: the admin's `metaTitle`/`metaDescription` on the model
 * (tier 1) → the generated «Чохли для iPhone 15 Pro» template (tier 2) →
 * `SeoSettings` defaults (tier 3). The template is the floor, not the ceiling —
 * one model's copy is shared by every category page it appears on, which is the
 * right granularity for the half of the title that is actually the query.
 *
 * Canonical/robots: self-canonical and indexable while unfiltered; `noindex,
 * follow` plus a canonical pointing at the CATEGORY the moment any facet rides
 * the query string (B-10 §5 — the one route allowed to emit both, see
 * `filteredCanonicalPath`).
 */
export async function generateMetadata({
  params,
  searchParams,
}: CompatLandingPageProps): Promise<Metadata> {
  const [{ category, device }, resolvedParams] = await Promise.all([
    params,
    searchParams,
  ]);

  const [page, seo] = await Promise.all([
    resolveCompatPage(category, device),
    fetchSeoSettings(),
  ]);

  // No such page: the minimal fallback. The page body's own notFound() (or its
  // 308) is what actually produces the response — this route has no
  // loading.tsx, so that hook still owns the status.
  if (!page) {
    return { title: dict.meta.compatFallbackTitle };
  }

  const model = page.deviceModel;
  const heading = dict.catalog.compatHeading(page.categoryName, model.name);
  const generatedDescription = dict.meta.compatDescription(
    page.categoryName,
    model.name,
  );

  const seoMeta = resolveSeo({
    settings: seo,
    entityTitle: model.metaTitle,
    entityDescription: model.metaDescription,
    content: {
      name: dict.meta.compatTitle(page.categoryName, model.name),
      // The model's own on-page lead when the admin wrote one; the generated
      // sentence otherwise. Either way it is page-specific text, never a
      // hard-coded dictionary constant.
      description: model.description ?? generatedDescription,
    },
  });

  const listingMeta = buildListingMetadata({
    basePath: `/catalog/${page.categorySlug}/${model.slug}`,
    page: Number(first(resolvedParams.page)),
    filters: readFilters(resolvedParams),
    // Where a FILTERED view of this page consolidates — the category, not the
    // unfiltered compat page (B-10 §5 keeps the indexable set to one dimension).
    filteredCanonicalPath: `/categories/${page.categorySlug}`,
  });

  const siteName = resolveSiteName(seo);
  const title = toMetadataTitle(seoMeta, {
    settings: seo,
    siteName,
    fallback: heading,
  });
  const description = seoMeta.description ?? generatedDescription;

  return {
    title,
    description,
    ...(listingMeta.canonicalPath
      ? { alternates: { canonical: `${SITE_URL}${listingMeta.canonicalPath}` } }
      : {}),
    ...(listingMeta.robots ? { robots: listingMeta.robots } : {}),
    // Declaring `openGraph` replaces the root layout's object wholesale, so
    // `images` has to be re-stated (same note as the category landing).
    openGraph: {
      title: title.absolute,
      description,
      url: `${SITE_URL}${listingMeta.canonicalPath ?? `/catalog/${page.categorySlug}/${model.slug}`}`,
      siteName,
      locale: "uk_UA",
      type: "website",
      images: buildOgImages({ defaultOgImage: seoMeta.ogImage }),
    },
  };
}

export default async function CompatLandingPage({
  params,
  searchParams,
}: CompatLandingPageProps) {
  const [{ category, device }, resolved] = await Promise.all([
    params,
    searchParams,
  ]);

  const page = await resolveCompatPage(category, device);
  if (!page) {
    // An admin may have renamed the CATEGORY's slug — serve the permanent
    // redirect to the current address instead of a dead 404, exactly as
    // `/categories/[slug]` does. The device segment is carried over untouched.
    //
    // KNOWN GAP: `SlugRedirectEntityKind` has no `DEVICE_MODEL`, so a renamed
    // DEVICE slug leaves no ledger entry and still 404s here. These URLs make
    // that rename user-visible for the first time; closing it needs a new kind
    // + a write from the device-model update path, which is its own task.
    const newCategorySlug = await resolveSlugRedirect("CATEGORY", category);
    if (newCategorySlug && newCategorySlug !== category) {
      permanentRedirect(`/catalog/${newCategorySlug}/${device}`);
    }
    notFound();
  }

  const model = page.deviceModel;
  const heading = dict.catalog.compatHeading(page.categoryName, model.name);
  const subtitle =
    model.description ??
    dict.catalog.compatSubtitle(page.categoryName, model.name);

  const minPrice = first(resolved.minPrice);
  const maxPrice = first(resolved.maxPrice);
  const specs = first(resolved.specs);
  const pageParam = first(resolved.page);

  // Both taxonomy axes come from the ROUTE, not from the query string — the two
  // segments are the filter. Everything else is an ordinary catalogue param.
  const initialParams: ProductControllerFindAllParams = {
    category: page.categorySlug,
    device: model.slug,
    brand: first(resolved.brand),
    search: first(resolved.search)?.trim() || undefined,
    sortBy: first(resolved.sortBy) ?? "createdAt",
    sortOrder: first(resolved.sortOrder) ?? "desc",
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    specs: specs || undefined,
    page: pageParam ? Number(pageParam) : 1,
    limit: 20,
    isActive: true,
  };

  const path = await resolveCategoryPath(page.categorySlug);
  const trail = [
    { name: dict.product.breadcrumbHome, href: "/" as string | undefined },
    ...(path ?? []).map((ancestor) => ({
      name: ancestor.name,
      href: `/categories/${ancestor.slug}` as string | undefined,
    })),
    // The tree read can fail (or the category can sit deeper than the public
    // tree reaches) — then the category still gets a crumb of its own, built
    // from what the API already told us.
    ...(path
      ? []
      : [
          {
            name: page.categoryName,
            href: `/categories/${page.categorySlug}` as string | undefined,
          },
        ]),
    { name: dict.catalog.compatBreadcrumb(model.name), href: undefined },
  ];

  const schemas = await buildCompatPageSchemas(page, trail);

  return (
    // eslint-disable-next-line tailwindcss/no-arbitrary-value -- mirrors the grandfathered /products catalog page shell (shared grid must align pixel-for-pixel)
    <div className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 sm:py-8">
      {schemas.breadcrumb && <JsonLd schema={schemas.breadcrumb} />}
      {schemas.itemList && <JsonLd schema={schemas.itemList} />}

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

      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- mirrors the grandfathered /products title block spacing */}
      <div className="mb-[18px]">
        {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- mirrors the grandfathered /products H1 type size */}
        <h1 className="font-display text-[31px] leading-tight font-bold tracking-tight text-foreground">
          {heading}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {subtitle}
        </p>
      </div>

      <Suspense fallback={<ProductListSkeleton />}>
        <ProductListView
          initialParams={initialParams}
          lockedCategory={{ id: page.categoryId, slug: page.categorySlug }}
          lockedDevice={{ slug: model.slug }}
        />
      </Suspense>
    </div>
  );
}

/**
 * BreadcrumbList + ItemList JSON-LD for a compat landing page. Each block fails
 * independently (null → omitted) so structured data never blocks the page —
 * same shape as `buildCategoryPageSchemas`.
 */
async function buildCompatPageSchemas(
  page: CompatLandingDetailEntity,
  trail: { name: string; href?: string }[],
): Promise<{
  breadcrumb: Record<string, unknown> | null;
  itemList: Record<string, unknown> | null;
}> {
  let breadcrumb: Record<string, unknown> | null = null;
  try {
    breadcrumb = buildBreadcrumbSchema(
      trail.map((crumb) => ({
        name: crumb.name,
        item: crumb.href
          ? `${SITE_URL}${crumb.href}`
          : `${SITE_URL}/catalog/${page.categorySlug}/${page.deviceModel.slug}`,
      })),
    );
  } catch {
    breadcrumb = null;
  }

  // One small server-side fetch of the page's first product page, purely for the
  // ItemList (it must exist in the initial HTML for crawlers) — the grid itself
  // hydrates client-side off its own query, the same split /products uses.
  let itemList: Record<string, unknown> | null = null;
  try {
    const { data: products } = await productControllerFindAll({
      category: page.categorySlug,
      device: page.deviceModel.slug,
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
