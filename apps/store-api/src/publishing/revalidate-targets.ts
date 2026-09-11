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
 * ## What a revalidate cannot reach (TASK-409, AD-PROD-16)
 *
 * This purges SERVER caches: Next's Data Cache and the prerendered homepage. It
 * cannot reach a tab that is already open. Hiding a product while a shopper is
 * looking at it therefore leaves it on their screen — the catalogue and the PDP
 * are client components fed by React Query, whose cache lives in the browser
 * with a 5-minute `staleTime`, and pressing Back re-uses it. That is what the
 * live run saw: a withdrawn product survived a back/forward round trip and
 * vanished only on a hard reload, while this endpoint had done its job.
 *
 * The storefront closes that gap on its own side — `popstate` invalidates the
 * query cache (`shared/lib/use-refresh-on-back-navigation`). Do NOT try to fix
 * it by widening the target here: no set of tags or paths can expire a cache
 * that is not on this machine.
 *
 * Exported as one shared constant rather than written out per call site so
 * product and category cannot drift apart (TASK-384).
 */
export const CATALOGUE_REVALIDATE_TARGET: RevalidateTarget = {
  tags: ['carousels'],
  paths: ['/'],
};
