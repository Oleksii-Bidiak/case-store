/**
 * Maximum quantity allowed per order line.
 *
 * Single source of truth for the per-item cap, shared across modules:
 * - CartService validates quantity writes against it, and CartItemEntity
 *   derives the public `maxQty` field (`min(MAX_QUANTITY, stock)`) so the raw
 *   stock figure never leaves the API (TASK-205).
 * - WishlistItemEntity derives the same capped `maxQty` for saved products
 *   (TASK-231).
 *
 * The storefront consumes `maxQty` as-is (stepper cap, out-of-stock = 0).
 * Re-exported from `cart/cart.constants.ts` to keep existing cart imports
 * working.
 */
export const MAX_QUANTITY = 99;
