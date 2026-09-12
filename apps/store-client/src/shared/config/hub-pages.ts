import type { PageEntityKind } from "@/shared/api/generated/models";

/**
 * Hub slug → storefront route (TASK-435).
 *
 * A `HUB` page row is not a page: it carries the `metaTitle`/`metaDescription`
 * of a listing route this app already implements in code. Its slug NAMES that
 * route, so these six pairs are the complete vocabulary — the API rejects a HUB
 * row on any other slug.
 *
 * This is the ONE place the storefront states the mapping: `generateMetadata()`
 * on each of the six hubs reads its slug from here, and `sitemap.ts` uses it to
 * know that a HUB row must NOT get a sitemap entry of its own (the route it
 * describes is already in the static list — emitting it twice would be a
 * duplicate URL).
 *
 * MIRRORED, deliberately: the API keeps the same table in
 * `apps/store-api/src/pages/hub-routes.ts` (it validates hub slugs and computes
 * which path to purge) and the panel in
 * `apps/store-admin/src/shared/config/hub-pages.ts` (slug picker + SERP-preview
 * breadcrumb). Nothing is shared at runtime between the three apps but the
 * OpenAPI contract, so each copy carries its own pinning test and all three move
 * together.
 */
export const HUB_PAGES = [
  { slug: "categories", route: "/categories" },
  { slug: "blog", route: "/blog" },
  { slug: "legal", route: "/legal" },
  { slug: "contact", route: "/contact" },
  { slug: "info", route: "/info" },
  { slug: "promo", route: "/promo" },
] as const;

/** The slug of a storefront hub whose meta tags an admin can edit. */
export type HubSlug = (typeof HUB_PAGES)[number]["slug"];

/** The route a hub slug describes, or null when the slug names no hub. */
export function hubRouteForSlug(slug: string): string | null {
  return HUB_PAGES.find((hub) => hub.slug === slug)?.route ?? null;
}

/**
 * The one INFO page whose body the `/info` hub renders inline, as the "Про нас"
 * section (TASK-435). It still has its own `/info/<slug>` address — every INFO
 * page does — but the same text then exists at two URLs, which is duplicate
 * content in the plainest sense.
 *
 * So this slug is the exception to the INFO rule: `/info` is its canonical home
 * (`/info/about` points there), and the sitemap emits no entry for it, because
 * `/info` is already in its static list. Declared here rather than as a literal
 * in the three files that need it, because a canonical and a sitemap that
 * disagree about which URL is primary is exactly the kind of drift neither file
 * would show on its own.
 */
export const INFO_SLUG_INLINED_ON_HUB = "about";

/**
 * Where a published page of the given kind is served, or null when it is served
 * nowhere. Used by the sitemap to turn a page row into a URL — and to drop the
 * HUB rows, whose routes the static list already covers.
 */
export function pageRouteFor(
  kind: PageEntityKind,
  slug: string,
): string | null {
  switch (kind) {
    case "LEGAL":
      return `/legal/${slug}`;
    case "INFO":
      // The inlined page is still reachable at /info/<slug>, but /info is its
      // canonical home and /info is already in the sitemap's static list — so,
      // exactly like a HUB row, it contributes no entry of its own here.
      return slug === INFO_SLUG_INLINED_ON_HUB ? null : `/info/${slug}`;
    case "HUB":
      // A hub row has no page of its own — the route it describes is a separate,
      // already-listed entry.
      return null;
  }
}
