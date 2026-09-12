import type { PageEntityKind } from "@/shared/api/generated/models";

/**
 * Hub slug → storefront route (TASK-435).
 *
 * A page of kind `HUB` is not a document: it supplies the `metaTitle` /
 * `metaDescription` of a listing route the storefront already implements in
 * code, and its slug NAMES that route. Only these six slugs mean anything — the
 * API rejects a HUB row on any other — which is why the page form offers a
 * picker here instead of a free-text slug field: a typo would otherwise create a
 * row that is editable, saved, and attached to nothing.
 *
 * MIRRORED, deliberately: the same table lives in
 * `apps/store-api/src/pages/hub-routes.ts` (validation + cache purging) and
 * `apps/store-client/src/shared/config/hub-pages.ts` (the hubs' metadata and the
 * sitemap). The three apps share only the OpenAPI contract at runtime, so each
 * copy is pinned by its own test and all three change together.
 */
export const HUB_PAGES = [
  { slug: "categories", route: "/categories" },
  { slug: "blog", route: "/blog" },
  { slug: "legal", route: "/legal" },
  { slug: "contact", route: "/contact" },
  { slug: "info", route: "/info" },
  { slug: "promo", route: "/promo" },
] as const;

/** The slug of a storefront hub whose meta tags the panel can edit. */
export type HubSlug = (typeof HUB_PAGES)[number]["slug"];

/** The route a hub slug describes, or null when the slug names no hub. */
export function hubRouteForSlug(slug: string): string | null {
  return HUB_PAGES.find((hub) => hub.slug === slug)?.route ?? null;
}

/**
 * The storefront path a page of this kind and slug will live at — what the SERP
 * preview shows under the green host.
 *
 * A HUB row has no address of its own, so it reports the route it describes
 * (`/blog`, not `/legal/blog`); an unrecognised hub slug reports nothing,
 * because such a row would render nowhere and the preview must not imply an
 * address that does not exist.
 */
export function pagePreviewPath(
  kind: PageEntityKind,
  slug: string,
): string | null {
  switch (kind) {
    case "LEGAL":
      return slug ? `/legal/${slug}` : "/legal";
    case "INFO":
      return slug ? `/info/${slug}` : "/info";
    case "HUB":
      return hubRouteForSlug(slug);
  }
}
