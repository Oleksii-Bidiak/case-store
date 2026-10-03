import { Suspense, Fragment, cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { permanentRedirect } from "next/navigation";
import { PrefetchBoundary } from "@/shared/api/prefetch-boundary";
import { ProductListView, ProductListSkeleton } from "@/widgets";
import {
  buildCatalogHeader,
  buildCatalogListingParams,
  findCategoryNodeBySlug,
  readSearchParamsRecord,
} from "@/widgets/product-list";
import {
  resolveLegacyCatalogParams,
  withQuery,
} from "@/shared/lib/legacy-catalog-params";
import { subcategoryChipsOf } from "@/features/product-filters";
import type {
  CategoryTreeNodeEntity,
  CategoryTreeResponse,
} from "@/shared/api/generated/models";
import {
  categoryControllerGetCategoryTree,
  getCategoryControllerGetCategoryTreeQueryKey,
} from "@/shared/api/generated/categories/categories";
import { getProductControllerFindAllQueryOptions } from "@/shared/api/generated/products/products";
import {
  createServerQueryClient,
  dehydrateForClient,
  prefetchQueries,
  serverRequestOptions,
} from "@/shared/api/query-prefetch-server";
import { JsonLd } from "@/shared/ui";
import {
  buildBreadcrumbSchema,
  buildProductItemListSchema,
} from "@/shared/lib/schema";
import {
  buildListingMetadata,
  buildOgImages,
  resolveSeo,
  resolveSiteName,
  toMetadataTitle,
  type ListingFilterParams,
} from "@/shared/lib/seo";
import { buildHubMetadata } from "@/shared/lib/seo/server";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";
import { SITE_URL, dict, PAGE_CONTAINER, H1_CLASS } from "@/shared/config";

/** Take the first value when a query param appears more than once. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Resolve the selected category node server-side (for the breadcrumb + title +
 * description + JSON-LD). Uses the public category tree so any node — root or
 * sub-category — resolves. Keyed by SLUG since TASK-420, the form the catalogue
 * URL now carries. Returns null on any failure so the catalog still renders.
 *
 * React `cache()` (TASK-703): `generateMetadata` and the page body both resolve
 * the node, and the tree read is axios, which Next's `fetch` dedup does not see —
 * so a `?category=` view used to download the tree twice. Scoped to one request.
 */
const resolveCategoryNode = cache(
  async (slug: string): Promise<CategoryTreeNodeEntity | null> => {
    const tree = await fetchCategoryTree();
    return tree ? findCategoryNodeBySlug(tree.data ?? [], slug) : null;
  },
);

/**
 * The public category tree, once per request (React `cache()`), or null on
 * any failure. Read for the selected category's name AND handed to the client
 * under the key `ProductListView`'s chips query uses (TASK-515), so one
 * download serves both — and the chips row is in the first HTML instead of
 * appearing after hydration and pushing the whole grid down.
 */
const fetchCategoryTree = cache(
  async (): Promise<CategoryTreeResponse | null> => {
    try {
      return (
        (await categoryControllerGetCategoryTree(serverRequestOptions())) ??
        null
      );
    } catch {
      return null;
    }
  },
);

/**
 * Serve the 308 from a pre-TASK-420 uuid URL to its slug form, if this is one.
 *
 * Called from BOTH `generateMetadata` and the page body, and the metadata half
 * is the one that matters: this route has a `loading.tsx`, so by the time the
 * page component runs Next may already have flushed a 200 shell, and a redirect
 * thrown there would degrade to a client-side hop while the old URL answered
 * 200. `generateMetadata` is awaited before anything is sent, so the status is
 * still ours there. The body call keeps the redirect true of the page in its own
 * right (and covers the route should the loading boundary ever be removed); the
 * two land on the same URL, so whichever wins is the same answer.
 *
 * Costs nothing on a modern URL: the helper returns `null` without a request
 * when no legacy param is present.
 */
async function redirectLegacyParams(resolvedParams: {
  [key: string]: string | string[] | undefined;
}): Promise<void> {
  const query = await resolveLegacyCatalogParams(resolvedParams);
  if (query !== null) permanentRedirect(withQuery("/products", query));
}

/**
 * Category-aware catalog metadata (plan 116 gap 1, plan 117 TASK-247). For a
 * `?category=` view the title/description are resolved through the shared
 * precedence helper so they are category-specific and SeoSettings-aware instead
 * of the generic "Товари", across all three tiers:
 *
 *   category metaTitle/metaDescription (tier 1) → category name/description
 *   (tier 2) → SeoSettings defaults (tier 3).
 *
 * TASK-432 inverted tiers 2 and 3: the global default used to outrank real
 * category content, so one line in /settings/seo described every listing.
 *
 * The category's own `metaTitle`/`metaDescription` admin overrides (tier 1) are
 * now surfaced on the public category tree (TASK-247), so they are passed here
 * as `entityTitle`/`entityDescription` and win when set. The unfiltered and
 * keyword-search views keep the static generic metadata.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const resolvedParams = await searchParams;
  // Before anything else: a uuid URL never gets metadata, it gets a 308.
  await redirectLegacyParams(resolvedParams);

  const categorySlug = first(resolvedParams.category);

  const [node, seo] = await Promise.all([
    categorySlug ? resolveCategoryNode(categorySlug) : Promise.resolve(null),
    fetchSeoSettings(),
  ]);
  // TASK-433: the store name is admin-managed; one read per request feeds both
  // the branded title template and every `og:site_name` below.
  const siteName = resolveSiteName(seo);

  // Canonical/robots policy (plan 143): ALL EIGHT filter params are read here —
  // brand/device/onSale/inStock included, even though the server-rendered query
  // only uses a subset — so the noindex decision is complete, not partial. Sort
  // params never participate (Decision 1). One helper call covers both branches:
  // a clean ?category= view canonicalizes onto its /categories/[slug] landing
  // page (TASK-277 behaviour, now inside the helper); any filter → noindex.
  // The two taxonomy filters are SLUGS since TASK-420 — the same spelling the
  // canonical they suppress would have used.
  const filters: ListingFilterParams = {
    search: first(resolvedParams.search)?.trim() || undefined,
    minPrice: first(resolvedParams.minPrice),
    maxPrice: first(resolvedParams.maxPrice),
    specs: first(resolvedParams.specs),
    brand: first(resolvedParams.brand),
    device: first(resolvedParams.device),
    onSale: first(resolvedParams.onSale),
    inStock: first(resolvedParams.inStock),
  };
  const listingMeta = buildListingMetadata({
    basePath: "/products",
    page: Number(first(resolvedParams.page)),
    filters,
    categoryCanonicalPath: node ? `/categories/${node.slug}` : undefined,
  });
  const canonicalAndRobots: Pick<Metadata, "alternates" | "robots"> = {
    ...(listingMeta.canonicalPath
      ? { alternates: { canonical: `${SITE_URL}${listingMeta.canonicalPath}` } }
      : {}),
    ...(listingMeta.robots ? { robots: listingMeta.robots } : {}),
  };

  // Category view: category-specific, SeoSettings-aware title/description.
  if (node) {
    const seoMeta = resolveSeo({
      settings: seo,
      entityTitle: node.metaTitle,
      entityDescription: node.metaDescription,
      content: { name: node.name, description: node.description },
    });
    const title = toMetadataTitle(seoMeta, {
      settings: seo,
      siteName,
      fallback: dict.meta.productsTitle,
    });
    const description = seoMeta.description ?? dict.meta.productsDescription;
    return {
      title,
      description,
      ...canonicalAndRobots,
      // TASK-432 — the catalogue had no openGraph block at all, so every shared
      // `/products?category=…` link previewed as the site-wide root card. The
      // canonical URL is the one the listing policy already picked (a clean
      // category view canonicalizes onto /categories/<slug>), so the preview and
      // the canonical never disagree.
      openGraph: {
        title: title.absolute,
        description,
        url: `${SITE_URL}${listingMeta.canonicalPath ?? "/products"}`,
        siteName,
        locale: "uk_UA",
        type: "website",
        // The category's OWN card first (TASK-437) — same chain as
        // /categories/[slug]. Without it the two surfaces that render a category
        // disagree about its preview image, and the admin-chosen card is dead on
        // every filtered `/products?category=…` link.
        images: buildOgImages({
          entityOgImage: node.ogImage,
          // TASK-569 — same chain as /categories/[slug]: the category's own
          // tile picture before the store-wide default.
          categoryImage: node.image,
          defaultOgImage: seoMeta.ogImage,
          alt: title.absolute,
          siteName,
        }),
      },
    };
  }

  // Unfiltered / keyword-search / unknown-category → the `products` HUB row
  // (TASK-549): `/products` was the one indexed listing whose title and
  // description the owner could change nowhere. Same three tiers as the other
  // hubs (row meta → row title/excerpt → dictionary). The listing policy still
  // decides canonical vs noindex: a clean view (incl. `?page=N`) is canonical, a
  // filtered one carries the policy's robots instead.
  return buildHubMetadata({
    slug: "products",
    canonical: `${SITE_URL}${listingMeta.canonicalPath ?? "/products"}`,
    fallbackTitle: dict.meta.productsTitle,
    fallbackDescription: dict.meta.productsDescription,
    robots: listingMeta.robots,
  });
}

/**
 * Resolve just the selected category's name (breadcrumb + on-page title). Thin
 * wrapper over `resolveCategoryNode`.
 */
async function resolveCategoryName(slug: string): Promise<string | null> {
  return (await resolveCategoryNode(slug))?.name ?? null;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolved = await searchParams;
  // Belt and braces with `generateMetadata` (see `redirectLegacyParams`): the
  // two run concurrently and either may win, and both land on the same URL. The
  // metadata one is what actually owns the status when a `loading.tsx` is in
  // play; this one keeps the redirect true of the page in its own right.
  await redirectLegacyParams(resolved);

  // The listing query of this URL — built by the same function the client view
  // reads the URL with (TASK-563), so the prefetched page below is the very
  // cache entry the grid asks for. It carries every rule the listing has
  // (TASK-513's literal-"true" boolean facets included).
  const initialParams = buildCatalogListingParams(
    readSearchParamsRecord(resolved),
  );
  const categorySlug = initialParams.category;
  const search = initialParams.search;

  // First HTML with the product cards in it (TASK-563): prefetch the grid's
  // page on the server and hand it over through the PrefetchBoundary below. A
  // failed prefetch is simply absent from the dehydrated state — the grid then
  // fetches on the client, as it always did.
  const queryClient = createServerQueryClient();
  const listingQuery = getProductControllerFindAllQueryOptions(initialParams, {
    request: serverRequestOptions(),
  });

  // Category-scoped catalog: resolve the name so the breadcrumb reveals the
  // categories hub + the specific category (and the title matches it).
  const [categoryName, categoryTree] = await Promise.all([
    categorySlug ? resolveCategoryName(categorySlug) : Promise.resolve(null),
    fetchCategoryTree(),
    prefetchQueries(queryClient, [listingQuery]),
  ]);
  // The chips row's data, under the chips query's own key (TASK-515). Absent
  // when the read failed — the view then shows the row's placeholder and
  // fetches the tree itself, as it did before.
  if (categoryTree) {
    queryClient.setQueryData(
      getCategoryControllerGetCategoryTreeQueryKey(),
      categoryTree,
    );
  }
  const withSubcategoryChips =
    subcategoryChipsOf(categoryTree?.data ?? [], categorySlug).length > 0;

  // ItemList from the same fetch as the grid (TASK-556 tail): the structured
  // data lists exactly the cards the page shows.
  const itemList = buildProductItemListSchema(
    queryClient.getQueryData(listingQuery.queryKey)?.data,
    SITE_URL,
  );

  const { trail, title, subtitle, currentPath } = buildCatalogHeader({
    categorySlug,
    categoryName,
    search,
  });

  return (
    <div className={`${PAGE_CONTAINER} py-6 sm:py-8`}>
      <JsonLd
        schema={buildBreadcrumbSchema(
          trail.map((crumb) => ({
            name: crumb.name,
            item: `${SITE_URL}${crumb.href ?? currentPath}`,
          })),
        )}
      />
      {itemList && <JsonLd schema={itemList} />}

      {/* Breadcrumbs */}
      <nav
        aria-label={dict.product.breadcrumbAria}
        className="mb-3.5 flex flex-wrap items-center gap-2.5 text-sm text-muted-foreground"
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
      <div className="mb-4.5">
        <h1 className={`${H1_CLASS} text-foreground`}>{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {subtitle}
        </p>
      </div>

      {/* The fallback stands in for ProductListView as a whole — chips row,
          toolbar and the 268px filter rail included (TASK-416) — so the grid
          does not render full-width and then shrink into a column. With a
          `?category=` the rail also reserves «Характеристики» (TASK-515). */}
      <PrefetchBoundary state={dehydrateForClient(queryClient)}>
        <Suspense
          fallback={
            <ProductListSkeleton
              withSidebar
              withSubcategoryChips={withSubcategoryChips}
              hasCategory={Boolean(categorySlug)}
            />
          }
        >
          <ProductListView
            initialParams={initialParams}
            categoryTreePrefetched={categoryTree !== null}
          />
        </Suspense>
      </PrefetchBoundary>
    </div>
  );
}
