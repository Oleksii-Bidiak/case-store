import type { Metadata } from "next";
import { PrefetchBoundary } from "@/shared/api/prefetch-boundary";
import { buildPromoDealsParams, PromoView } from "@/widgets/promo";
import { ACTIVE_ROOT_CATEGORIES_PARAMS } from "@/entities/category";
import { getCategoryControllerGetRootCategoriesQueryOptions } from "@/shared/api/generated/categories/categories";
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
import { buildHubMetadata } from "@/shared/lib/seo/server";
import { SITE_URL, dict } from "@/shared/config";

/**
 * Time floor for the prerendered page (TASK-563). The deals grid is baked into
 * this page's HTML from an axios read, which Next's Data Cache cannot tag, so
 * on-demand revalidation reaches it only through the catalogue target's
 * `paths` (store-api `revalidate-targets.ts`) — i.e. on a product or category
 * write. A build that ran while the API was unreachable would otherwise ship a
 * page without products until the next such write; an hour bounds that. The
 * shopper is unaffected either way: a baked copy older than the client's
 * `staleTime` is refetched on mount.
 */
export const revalidate = 3600;

// TASK-435 — admin-managed via the `promo` HUB page row; dictionary fallback.
export function generateMetadata(): Promise<Metadata> {
  return buildHubMetadata({
    slug: "promo",
    canonical: `${SITE_URL}/promo`,
    fallbackTitle: dict.meta.promoTitle,
    fallbackDescription: dict.meta.promoDescription,
  });
}

/**
 * `/promo` — the Акції (promotions) landing page. Static shell + client widgets;
 * the deals grid reads real on-sale products. Its first page and the category
 * tabs are prefetched on the server (TASK-563), so the prerendered HTML already
 * links to the discounted products instead of showing a skeleton.
 */
export default async function PromoPage() {
  const queryClient = createServerQueryClient();
  const dealsQuery = getProductControllerFindAllQueryOptions(
    buildPromoDealsParams(null),
    { request: serverRequestOptions() },
  );
  await prefetchQueries(queryClient, [
    dealsQuery,
    getCategoryControllerGetRootCategoriesQueryOptions(
      ACTIVE_ROOT_CATEGORIES_PARAMS,
      { request: serverRequestOptions() },
    ),
  ]);

  // ItemList from the grid's own fetch (TASK-556 tail): the structured data
  // names exactly the deals the page shows.
  const itemList = buildProductItemListSchema(
    queryClient.getQueryData(dealsQuery.queryKey)?.data,
    SITE_URL,
  );

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-[22px] pb-16 sm:px-6">
      <JsonLd
        schema={buildBreadcrumbSchema([
          { name: dict.promo.breadcrumbHome, item: SITE_URL },
          { name: dict.promo.breadcrumb, item: `${SITE_URL}/promo` },
        ])}
      />
      {itemList && <JsonLd schema={itemList} />}
      <PrefetchBoundary state={dehydrateForClient(queryClient)}>
        <PromoView />
      </PrefetchBoundary>
    </div>
  );
}
