import type { ProductControllerFindAllParams } from "@/entities/product";

/** Page size for the on-sale grid. */
export const DEALS_LIMIT = 12;

/**
 * The listing query of the «Товари зі знижкою» grid for one category tab
 * (`null` = «Усі»). The grid reads it, and `/promo` prefetches the «Усі» tab
 * with it on the server (TASK-563) — one builder, so both hold the same React
 * Query key and the prerendered cards are adopted rather than re-fetched.
 */
export function buildPromoDealsParams(
  categoryId: string | null,
): ProductControllerFindAllParams {
  return {
    isActive: true,
    onSale: true,
    limit: DEALS_LIMIT,
    sortBy: "createdAt",
    sortOrder: "desc",
    ...(categoryId ? { categoryId } : {}),
  };
}
