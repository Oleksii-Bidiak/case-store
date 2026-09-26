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

/**
 * Guest-cart cleanup (TASK-776). A cart row is created by the first add, but a
 * guest can empty it again, and before TASK-776 every READ created one — so
 * empty guest carts accumulate. A daily sweep removes the ones that hold no
 * lines and were not touched for this long. An empty cart is worth nothing, so
 * the window only has to outlast an add in flight (`findOrCreate` touches
 * `updatedAt` before the line is written); the guest's next add simply creates
 * a fresh row under the same cookie token.
 *
 * Fixed in code rather than env: nothing about a deployment should change them.
 */
export const GUEST_CART_EMPTY_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Daily at 03:30 server time — off-peak, and clear of the 03:00 token cleanup. */
export const GUEST_CART_CLEANUP_CRON = '30 3 * * *';
