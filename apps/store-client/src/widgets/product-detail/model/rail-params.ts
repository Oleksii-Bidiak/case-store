import type { ProductControllerFindAllParams } from "@/entities/product";

/** The one filter that tells the PDP's rails apart. */
export type ProductRailFilter = Pick<
  ProductControllerFindAllParams,
  "categoryId" | "deviceModelId"
>;

/** Eight other products plus the current one, which the rail filters out. */
export const PRODUCT_RAIL_LIMIT = 9;

/**
 * The listing query of one PDP rail («Сумісні аксесуари» / «Схожі товари»).
 *
 * One builder for the rail and the PDP route (TASK-563): the route prefetches
 * the rails on the server so the first HTML already links to other products,
 * and that prefetch is only adopted when its React Query key is exactly the
 * key the rail asks for.
 */
export function buildProductRailParams(
  filter: ProductRailFilter,
): ProductControllerFindAllParams {
  return {
    ...filter,
    isActive: true,
    page: 1,
    limit: PRODUCT_RAIL_LIMIT,
    sortBy: "createdAt",
    sortOrder: "desc",
  };
}
