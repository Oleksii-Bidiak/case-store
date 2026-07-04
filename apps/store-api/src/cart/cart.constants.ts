/**
 * Maximum quantity allowed per cart line.
 *
 * Single source of truth for the per-item cap: CartService validates writes
 * against it, and CartItemEntity uses it to derive the public `maxQty` field
 * (`min(MAX_QUANTITY, stock)`) so the raw stock figure never leaves the API
 * (TASK-205). The storefront stepper consumes `maxQty` as-is.
 */
export const MAX_QUANTITY = 99;
