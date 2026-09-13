import { PageKind } from '@prisma/client';

/**
 * Hub slug → storefront route (TASK-435).
 *
 * A `PageKind.HUB` row is not a page: it carries `metaTitle`/`metaDescription`
 * for a listing route that already exists in the storefront's own code. Its
 * `slug` is therefore not a free-form address but the NAME of that route, and
 * only the six slugs below mean anything. A HUB row with any other slug would be
 * a ghost — editable in the panel, rendered nowhere — so `create`/`update`
 * reject one (see PageService.assertHubSlug).
 *
 * This table is what turns a hub slug back into the path to purge from the
 * storefront cache when its meta tags change.
 *
 * MIRRORED, deliberately: the storefront keeps the same six pairs in
 * `apps/store-client/src/shared/config/hub-pages.ts` (its sitemap and the six
 * `generateMetadata()` call sites read it) and the panel in
 * `apps/store-admin/src/shared/config/hub-pages.ts` (the slug picker and the
 * SERP-preview breadcrumb). There is no shared runtime between the three apps —
 * only the OpenAPI contract — so each copy is pinned by its own unit test and
 * all three change in the same commit.
 */
export const HUB_ROUTES: Readonly<Record<string, string>> = {
  categories: '/categories',
  blog: '/blog',
  legal: '/legal',
  contact: '/contact',
  info: '/info',
  promo: '/promo',
};

/** The slugs a HUB row may carry, in storefront-navigation order. */
export const HUB_SLUGS: readonly string[] = Object.keys(HUB_ROUTES);

/** The storefront route a hub slug describes, or null when the slug is not a hub. */
export function hubRouteForSlug(slug: string): string | null {
  return HUB_ROUTES[slug] ?? null;
}

/**
 * Every root storefront path a page can surface on: the two page hubs (`/legal`,
 * `/info`) plus all six hub routes, deduplicated — `/legal` and `/info` are both.
 * Used by the scheduler's coarse purge, which cannot know which rows it flipped.
 */
export const PAGE_ROOT_PATHS: readonly string[] = [
  ...new Set(['/legal', '/info', ...Object.values(HUB_ROUTES)]),
];

/**
 * Storefront paths to purge when a page of the given kind changes.
 *
 * - `LEGAL` → the `/legal` hub and the document itself.
 * - `INFO`  → the `/info` hub (its "Про нас" block reads the `about` page) and
 *   the document itself.
 * - `HUB`   → the one route the row describes; a HUB row has no page of its own,
 *   so an unknown hub slug yields nothing to purge rather than a dead path.
 */
export function revalidatePathsForPage(kind: PageKind, slug: string): string[] {
  switch (kind) {
    case PageKind.LEGAL:
      return ['/legal', `/legal/${slug}`];
    case PageKind.INFO:
      return ['/info', `/info/${slug}`];
    case PageKind.HUB: {
      const route = hubRouteForSlug(slug);
      return route ? [route] : [];
    }
  }
}
