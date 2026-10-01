import { Suspense } from "react";
import type { Metadata } from "next";
import { PrefetchBoundary } from "@/shared/api/prefetch-boundary";
import { PROMO_DEALS_ANCHOR, PROMO_LISTING_LOCKS } from "@/widgets/promo";
import {
  ProductListSkeleton,
  ProductListView,
  buildCatalogListingParams,
  readSearchParamsRecord,
} from "@/widgets/product-list";
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
  type ListingFilterParams,
} from "@/shared/lib/seo";
import { buildHubMetadata } from "@/shared/lib/seo/server";
import { SITE_URL, dict } from "@/shared/config";

type PromoSearchParams = Promise<{
  [key: string]: string | string[] | undefined;
}>;

/** Take the first value when a query param appears more than once. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The robots of a narrowed view — the same value the listing policy returns. */
const NOINDEX_FOLLOW = { index: false, follow: true } as const;

// TASK-435 — admin-managed via the `promo` HUB page row; dictionary fallback.
// Since TASK-1301 the deals are a filterable listing, so the same canonical /
// noindex policy as `/products` applies (plan 143): a clean view — `?page=N`
// included — is canonical, any filter is noindex. `onSale` is the page itself
// here, not a filter, so it is not passed.
//
// `?category=` is the one difference. On `/products` a clean category view has
// a landing page of its own to canonicalise onto (`/categories/<slug>`); the
// deals have no per-category landing, so here it is a narrowing like any other
// filter — noindex,follow and no canonical. Left to the helper (which keeps
// `category` out of its filter list for the `/products` reason), the CategoryChips
// links would each canonicalise onto `/promo` or `/promo?page=N`, a different
// result set.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: PromoSearchParams;
}): Promise<Metadata> {
  const resolved = await searchParams;
  const category = first(resolved.category)?.trim() || undefined;
  const filters: ListingFilterParams = {
    search: first(resolved.search)?.trim() || undefined,
    minPrice: first(resolved.minPrice),
    maxPrice: first(resolved.maxPrice),
    specs: first(resolved.specs),
    brand: first(resolved.brand),
    device: first(resolved.device),
    inStock: first(resolved.inStock),
  };
  const listingMeta = category
    ? { canonicalPath: undefined, robots: NOINDEX_FOLLOW }
    : buildListingMetadata({
        basePath: "/promo",
        page: Number(first(resolved.page)),
        filters,
      });

  return buildHubMetadata({
    slug: "promo",
    canonical: `${SITE_URL}${listingMeta.canonicalPath ?? "/promo"}`,
    fallbackTitle: dict.meta.promoTitle,
    fallbackDescription: dict.meta.promoDescription,
    robots: listingMeta.robots,
  });
}

/**
 * `/promo` — the Акції (promotions) landing page: hero, coupons, the on-sale
 * catalogue and the subscribe block. The page renders the catalogue; the rest
 * is the segment layout around it (TASK-869).
 *
 * The deals are the catalogue listing with a discount lock (TASK-1301): the
 * page reads the URL through `buildCatalogListingParams`, the builder the
 * client view uses, and prefetches that first page on the server (TASK-563) so
 * the first HTML carries the discounted products' links and the ItemList names
 * exactly those cards. Reading `searchParams` makes the route dynamic — the same
 * trade `/products` makes, since a filter or `?page=` is part of what it shows.
 */
export default async function PromoPage({
  searchParams,
}: {
  searchParams: PromoSearchParams;
}) {
  const resolved = await searchParams;
  const listingParams = buildCatalogListingParams(
    readSearchParamsRecord(resolved),
    PROMO_LISTING_LOCKS,
  );

  const queryClient = createServerQueryClient();
  const listingQuery = getProductControllerFindAllQueryOptions(listingParams, {
    request: serverRequestOptions(),
  });
  await prefetchQueries(queryClient, [listingQuery]);

  // ItemList from the grid's own fetch (TASK-556 tail): the structured data
  // names exactly the deals the page shows.
  const itemList = buildProductItemListSchema(
    queryClient.getQueryData(listingQuery.queryKey)?.data,
    SITE_URL,
  );

  // The container, hero, coupons, deals heading and subscribe block are the
  // segment's `layout.tsx` (TASK-869); this page is what streams into the
  // deals slot, and `loading.tsx` stands in for exactly that.
  return (
    <>
      <JsonLd
        schema={buildBreadcrumbSchema([
          { name: dict.promo.breadcrumbHome, item: SITE_URL },
          { name: dict.promo.breadcrumb, item: `${SITE_URL}/promo` },
        ])}
      />
      {itemList && <JsonLd schema={itemList} />}
      <PrefetchBoundary state={dehydrateForClient(queryClient)}>
        {/* The fallback stands in for the whole listing — chips row, toolbar
            and the filter rail — like on /products (TASK-416). Its rail has no
            «Знижки» (the route fixes it) and reserves «Характеристики» under a
            `?category=` (TASK-515). */}
        <Suspense
          fallback={
            <ProductListSkeleton
              withSidebar
              lockedOnSale={PROMO_LISTING_LOCKS.onSale}
              hasCategory={Boolean(listingParams.category)}
            />
          }
        >
          <ProductListView
            lockedOnSale={PROMO_LISTING_LOCKS.onSale}
            anchorId={PROMO_DEALS_ANCHOR}
          />
        </Suspense>
      </PrefetchBoundary>
    </>
  );
}
