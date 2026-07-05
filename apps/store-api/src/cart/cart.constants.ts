/**
 * Maximum quantity allowed per cart line.
 *
 * The constant itself lives in `common/constants` — the single source of truth
 * shared with the wishlist (WishlistItemEntity derives the same capped
 * `maxQty`, TASK-231) — and is re-exported here so cart-module consumers keep
 * their local import path. CartService validates writes against it, and
 * CartItemEntity uses it to derive the public `maxQty` field
 * (`min(MAX_QUANTITY, stock)`) so the raw stock figure never leaves the API
 * (TASK-205). The storefront stepper consumes `maxQty` as-is.
 */
export { MAX_QUANTITY } from '../common/constants';
