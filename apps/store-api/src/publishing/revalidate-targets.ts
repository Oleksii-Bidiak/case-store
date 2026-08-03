import type { RevalidateTarget } from './publishing.tokens';

/**
 * What the storefront must purge after a catalogue write (product or category).
 *
 * ## Why `carousels` and not `products`
 *
 * There is no `products` cache tag, and adding one would buy nothing: every
 * catalogue route the shopper actually browses — `/products`,
 * `/products/[slug]`, `/categories/[slug]`, `/search` — is rendered per request
 * through the Orval axios client, which Next's Data Cache does not intercept.
 * Those pages are already fresh (bounded only by the API's own Redis TTL).
 *
 * The page that goes stale is the HOMEPAGE. It is statically prerendered, and
 * `fetchPublishedCarouselsByPlacement()` bakes each rail's resolved product
 * list — name, price, image — straight into that HTML under the `carousels`
 * tag. So a price edit had no way to reach it: the admin write purged Redis,
 * the homepage kept serving the old numbers, and the only thing that ever
 * refreshed it was the ISR timer. `paths: ['/']` is the belt to that braces —
 * it also covers anything else the homepage renders from catalogue data.
 *
 * Exported as one shared constant rather than written out per call site so
 * product and category cannot drift apart (TASK-384).
 */
export const CATALOGUE_REVALIDATE_TARGET: RevalidateTarget = {
  tags: ['carousels'],
  paths: ['/'],
};
