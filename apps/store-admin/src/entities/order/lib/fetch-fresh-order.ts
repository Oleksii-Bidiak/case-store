import type { QueryClient } from "@tanstack/react-query";
import {
  getAdminOrderControllerFindByIdQueryOptions,
  type OrderEntity,
} from "@/shared/api";

/**
 * The order as the server holds it NOW — for an edit form whose save was just
 * refused as stale (TASK-1972).
 *
 * `fetchQuery` rather than `invalidateQueries`: invalidation refetches only a
 * query somebody observes and resolves with nothing, while the stale-draft
 * review needs the colleague's version in hand. Going through the detail query's
 * own key also updates the cache the order card reads, so the card's `order`
 * prop moves to the same version the review shows.
 */
export async function fetchFreshOrder(
  queryClient: QueryClient,
  orderId: string,
): Promise<OrderEntity> {
  const response = await queryClient.fetchQuery({
    ...getAdminOrderControllerFindByIdQueryOptions(orderId),
    staleTime: 0,
  });
  return response.data;
}
