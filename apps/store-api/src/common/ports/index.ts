// Cross-feature ports: narrow seams that let one feature call another without a
// file-level import between the two (see each file for the cycle it avoids).
// Both files are leaves — keep it that way, or this barrel stops being safe to
// import from either side.
export { CategorySubtreeIndexer } from './category-subtree-indexer.port';
export { GUEST_ORDER_CLAIM_PORT, type GuestOrderClaimPort } from './guest-order-claim.port';
