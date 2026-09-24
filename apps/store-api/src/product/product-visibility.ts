import { Prisma } from '@prisma/client';

/**
 * The one rule for «may a shopper see this product» (TASK-781/782).
 *
 * A product is publicly visible when it is on sale (`isActive`), not
 * soft-deleted, AND its category is active — deactivating a category withdraws
 * every product in it (TASK-297). Every public read of a product row — listing,
 * PDP, cards, variant siblings, search, addon resolution, wishlist — goes
 * through this predicate, so a hidden product answers exactly like a
 * nonexistent one (404 / absent), never with its prices.
 *
 * Before this constant each reader spelled the rule out inline, and two of them
 * (the variant-group siblings) quietly dropped the category half: colour dots
 * led to a 404 and «від X ₴» was priced from a position nobody could buy.
 * A second spelling is a spelling that drifts — import this instead.
 *
 * Admin reads (preview, CRUD, SEO health) deliberately do NOT use it.
 */
export const PUBLIC_PRODUCT_WHERE = {
  isActive: true,
  deletedAt: null,
  category: { isActive: true },
} as const satisfies Prisma.ProductWhereInput;

/**
 * The same rule for a row already in memory. The row must carry `isActive`,
 * `deletedAt` and its category's `isActive`; a missing category counts as
 * hidden, because a product with no loaded category cannot prove it is on sale.
 */
export function isPubliclyVisible(product: {
  isActive: boolean;
  deletedAt: Date | null;
  category?: { isActive: boolean } | null;
}): boolean {
  return product.isActive && product.deletedAt === null && product.category?.isActive === true;
}
