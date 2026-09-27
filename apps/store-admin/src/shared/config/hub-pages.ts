import type { PageEntityKind } from "@/shared/api/generated/models";

/**
 * Hub slug → storefront route (TASK-435).
 *
 * A page of kind `HUB` is not a document: it supplies the `metaTitle` /
 * `metaDescription` of a listing route the storefront already implements in
 * code, and its slug NAMES that route. Only these seven slugs mean anything — the
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
  // TASK-549 — the unfiltered catalogue, the one indexed listing whose meta the
  // owner could not edit anywhere before.
  { slug: "products", route: "/products" },
] as const;

/** The slug of a storefront hub whose meta tags the panel can edit. */
export type HubSlug = (typeof HUB_PAGES)[number]["slug"];

/** The route a hub slug describes, or null when the slug names no hub. */
export function hubRouteForSlug(slug: string): string | null {
  return HUB_PAGES.find((hub) => hub.slug === slug)?.route ?? null;
}

/**
 * INFO slugs whose body the storefront's `/info` hub renders INLINE (TASK-565):
 * «Про нас» (TASK-435) and the delivery / payment / warranty / «у цифрах»
 * blocks (TASK-560). The storefront finds each by this exact slug, so renaming,
 * unpublishing or deleting one silently changes `/info` — the page list marks
 * these rows so nobody does that unawares.
 *
 * MIRRORED: the storefront's `shared/config/hub-pages.ts`
 * (`INFO_SLUGS_INLINED_ON_HUB`) is the list it actually reads; each copy is
 * pinned by its own test.
 */
export const INFO_SLUGS_INLINED_ON_HUB: readonly string[] = [
  "about",
  "info-delivery",
  "info-payment",
  "info-warranty",
  "info-about-stats",
];

/** True for an INFO row the storefront renders inside `/info` itself. */
export function isInlinedOnInfoHub(
  kind: PageEntityKind,
  slug: string,
): boolean {
  return kind === "INFO" && INFO_SLUGS_INLINED_ON_HUB.includes(slug);
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
