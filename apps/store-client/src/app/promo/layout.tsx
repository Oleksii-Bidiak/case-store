import type { ReactNode } from "react";
import { PromoView } from "@/widgets/promo";
import { PAGE_CONTAINER } from "@/shared/config";
import { PrefetchBoundary } from "@/shared/api/prefetch-boundary";
import { getListActiveDiscountsQueryOptions } from "@/shared/api/generated/discounts/discounts";
import {
  createServerQueryClient,
  dehydrateForClient,
  prefetchQueries,
  serverRequestOptions,
} from "@/shared/api/query-prefetch-server";

/**
 * The static frame of `/promo` (TASK-869): container, breadcrumb, hero,
 * coupons, the «Товари зі знижкою» heading and the subscribe block. The page
 * streams into the deals slot, so the segment's `loading.tsx` — which Next nests
 * INSIDE this layout — only has to stand in for the listing itself.
 *
 * Why a layout and not a copy of the hero in `loading.tsx`: the frame reads no
 * request data, so it paints for real the moment the route is entered, and it
 * is the same React tree before and after the page lands — the countdown does
 * not restart, the coupons query is not re-mounted, and a filter change on
 * `?category=` re-renders only the listing under it.
 *
 * The coupons are prefetched here (TASK-869 fix round, the TASK-563 pattern):
 * a ticket's height depends on where its title and condition wrap — measured
 * 126.5 / 146.5 / 163px across 320…1440px — so NO fixed-height placeholder
 * can stand in for it without the deals below jumping when the codes land.
 * With the feed in the first HTML there is no placeholder to swap. The feed
 * is one small public query under the same 5 s deadline as every server
 * prefetch; if it fails, `PromoCoupons` falls back to fetching on the client
 * behind its placeholder, i.e. the behaviour before this prefetch existed.
 */
export default async function PromoLayout({
  children,
}: {
  children: ReactNode;
}) {
  const queryClient = createServerQueryClient();
  await prefetchQueries(queryClient, [
    getListActiveDiscountsQueryOptions({ request: serverRequestOptions() }),
  ]);

  return (
    <div className={`${PAGE_CONTAINER} pt-5.5 pb-16`}>
      <PrefetchBoundary state={dehydrateForClient(queryClient)}>
        <PromoView deals={children} />
      </PrefetchBoundary>
    </div>
  );
}
