import type { Metadata } from "next";
import { PrefetchBoundary } from "@/shared/api/prefetch-boundary";
import { CategoriesView } from "@/widgets/categories";
import { getBrandControllerFindAllQueryOptions } from "@/shared/api/generated/brands/brands";
import { getCategoryControllerGetCategoryTreeQueryOptions } from "@/shared/api/generated/categories/categories";
import {
  createServerQueryClient,
  dehydrateForClient,
  prefetchQueries,
  serverRequestOptions,
} from "@/shared/api/query-prefetch-server";
import { JsonLd } from "@/shared/ui";
import { buildBreadcrumbSchema } from "@/shared/lib/schema";
import { buildHubMetadata } from "@/shared/lib/seo/server";
import { SITE_URL, dict, PAGE_CONTAINER } from "@/shared/config";

/**
 * Time floor for the prerendered hub (TASK-563) — same reasoning as `/promo`:
 * the tree is baked from an axios read that on-demand revalidation reaches only
 * through the catalogue target's `paths`, and brand edits do not send one at
 * all. An hour bounds how long a stale or empty (API down at build) copy can
 * live; shoppers get a fresh tree on mount regardless.
 */
export const revalidate = 3600;

// TASK-435 — title/description now come from the `categories` HUB page row, so
// the owner can tune this listing's search result from the panel. The dictionary
// strings below stay as the fallback for "no row yet / API down".
export function generateMetadata(): Promise<Metadata> {
  return buildHubMetadata({
    slug: "categories",
    canonical: `${SITE_URL}/categories`,
    fallbackTitle: dict.meta.categoriesTitle,
    fallbackDescription: dict.meta.categoriesDescription,
  });
}

export default async function CategoriesPage() {
  // First HTML with the category tiles — and their links — in it (TASK-563):
  // the tree and the brand strip are prefetched under the keys CategoriesView
  // reads. A failed prefetch leaves the view to fetch on the client, as before.
  const queryClient = createServerQueryClient();
  await prefetchQueries(queryClient, [
    getCategoryControllerGetCategoryTreeQueryOptions({
      request: serverRequestOptions(),
    }),
    getBrandControllerFindAllQueryOptions(undefined, {
      request: serverRequestOptions(),
    }),
  ]);

  return (
    <div className={`${PAGE_CONTAINER} pt-[22px] pb-16`}>
      <JsonLd
        schema={buildBreadcrumbSchema([
          { name: dict.categories.breadcrumbHome, item: SITE_URL },
          { name: dict.meta.categoriesTitle, item: `${SITE_URL}/categories` },
        ])}
      />
      <PrefetchBoundary state={dehydrateForClient(queryClient)}>
        <CategoriesView />
      </PrefetchBoundary>
    </div>
  );
}
