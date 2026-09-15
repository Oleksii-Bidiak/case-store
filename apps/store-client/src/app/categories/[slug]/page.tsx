import { Suspense, Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
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
import {
  resolveLegacyCatalogParams,
  withQuery,
} from "@/shared/lib/legacy-catalog-params";
import { SITE_URL, dict } from "@/shared/config";

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
 * Serve the 308 from a pre-TASK-420 uuid query to its slug form, if this is one.
 *
 * `?categoryId=` is DROPPED rather than rewritten here: the category is the
 * route segment, so a second one in the query could only ever agree redundantly
 * or contradict — and `ProductListView` ignores it on a locked page anyway.
 */
async function redirectLegacyParams(
  slug: string,
  resolvedParams: { [key: string]: string | string[] | undefined },
): Promise<void> {
  const query = await resolveLegacyCatalogParams(resolvedParams, {
    dropCategory: true,
  });
  if (query !== null) {
    permanentRedirect(withQuery(`/categories/${slug}`, query));
  }
}

/**
 * Category landing metadata (TASK-277): the shared precedence chain — the
 * category's own metaTitle/metaDescription (tier 1, admin override) → category
 * name/description (tier 2) → SeoSettings defaults (tier 3, order inverted by
 * TASK-432 so the global default no longer outranks real content) — plus
 * the shared canonical/robots policy (TASK-278, plan 143): self-canonical
 * (with `?page=N` beyond page 1) when unfiltered, `noindex,follow` when any
 * filter param rides the query string.
 */
export async function generateMetadata({
  params,
  searchParams,
}: CategoryLandingPageProps): Promise<Metadata> {
  const [{ slug }, resolvedParams] = await Promise.all([params, searchParams]);
  // A uuid-param URL never gets metadata, it gets a 308 (TASK-420). Mirrored in
  // the page body below — unlike /products this route has no `loading.tsx`, so
  // either hook can own the status; both land on the same URL.
  await redirectLegacyParams(slug, resolvedParams);

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

  // All eight filter params are read so the noindex decision is complete —
  // sort params never participate; no categoryCanonicalPath here because the
  // category is already the URL segment (plan 143, Decisions 1 & 3).
  const filters: ListingFilterParams = {
    search: first(resolvedParams.search)?.trim() || undefined,
    minPrice: first(resolvedParams.minPrice),
    maxPrice: first(resolvedParams.maxPrice),
    specs: first(resolvedParams.specs),
    // Slugs since TASK-420 — `?brand=apple&device=iphone-15`.
    brand: first(resolvedParams.brand),
    device: first(resolvedParams.device),
    onSale: first(resolvedParams.onSale),
    inStock: first(resolvedParams.inStock),
  };
  const listingMeta = buildListingMetadata({
    basePath: `/categories/${node.slug}`,
    page: Number(first(resolvedParams.page)),
    filters,
  });

  // TASK-433 — admin-managed store name, one value shared by the title template
  // and the og:site_name below.
  const siteName = resolveSiteName(seo);
  const title = toMetadataTitle(seoMeta, {
    settings: seo,
    siteName,
    fallback: node.name,
  });
  const description =
    seoMeta.description ?? dict.catalog.categorySubtitle(node.name);

  return {
    title,
    description,
    ...(listingMeta.canonicalPath
      ? { alternates: { canonical: `${SITE_URL}${listingMeta.canonicalPath}` } }
      : {}),
    ...(listingMeta.robots ? { robots: listingMeta.robots } : {}),
    // TASK-432 — the landing page had no openGraph block, so a shared category
    // link previewed as the site-wide root card instead of the category. `url`
    // follows the same canonical the listing policy picked (self-canonical, with
    // `?page=N` past page 1); `images` must be re-stated because declaring an
    // `openGraph` here replaces the root layout's object wholesale.
    openGraph: {
      title: title.absolute,
      description,
      url: `${SITE_URL}${listingMeta.canonicalPath ?? `/categories/${node.slug}`}`,
      siteName,
      locale: "uk_UA",
      type: "website",
      // TASK-437 — a category can now carry its own card; the landing page has
      // no automatic image of its own, so without one the chain still ends at
      // the global default and then the brand card.
      images: buildOgImages({
        entityOgImage: node.ogImage,
        defaultOgImage: seoMeta.ogImage,
      }),
    },
  };
}

export default async function CategoryLandingPage({
  params,
  searchParams,
}: CategoryLandingPageProps) {
  const [{ slug }, resolved] = await Promise.all([params, searchParams]);
  await redirectLegacyParams(slug, resolved);

  const path = await resolveCategoryPath(slug);
  if (!path) {
    // TASK-285 (Крок W): an admin may have renamed the slug — serve a
    // permanent (308) redirect to the current address instead of a dead 404.
    // Same page-body-only pattern as products/[slug]: generateMetadata keeps
    // its minimal fallback for an unknown slug, because this route has no
    // loading.tsx (see below), so the redirect thrown here still owns the
    // HTTP response.
    const newSlug = await resolveSlugRedirect("CATEGORY", slug);
    if (newSlug) {
      permanentRedirect(`/categories/${newSlug}`);
    }
    // Real HTTP 404 — the category is resolved server-side before the
    // response is built (unlike the PDP's client-fetched soft-404). This is
    // also why the route deliberately has NO route-level loading.tsx: a
    // loading boundary starts streaming a 200 shell before notFound() can set
    // the status (verified live; /legal/[slug] and /products/[slug] had that
    // flaw until their loading.tsx removal in the TASK-285 review follow-up;
    // /blog/[slug] never had one and returns a true 404). The in-page
    // <Suspense> skeleton below covers the grid-loading UX instead.
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
    // The route's own slug IS the category filter (TASK-420) — no id round-trip.
    category: node.slug,
    brand: first(resolved.brand),
    device: first(resolved.device),
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
          // Slug for the listing filter, id for the id-addressed side endpoints
          // (brands-per-category, filterable specs) — TASK-420.
          lockedCategory={{ id: node.id, slug: node.slug }}
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
      category: node.slug,
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
