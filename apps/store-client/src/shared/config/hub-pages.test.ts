import {
  HUB_PAGES,
  INFO_HUB_SECTION_SLUGS,
  INFO_SLUG_INLINED_ON_HUB,
  hubRouteForSlug,
  isInfoSlugInlinedOnHub,
  pageCanonicalPath,
  pageRouteFor,
} from "./hub-pages";

/**
 * The storefront's copy of the hub table (TASK-435). The API
 * (`apps/store-api/src/pages/hub-routes.ts`) and the panel
 * (`apps/store-admin/src/shared/config/hub-pages.ts`) keep the same pairs, each
 * pinned by its own test, and all three move together.
 */
describe("HUB_PAGES", () => {
  it("pins the seven hubs", () => {
    expect(HUB_PAGES).toEqual([
      { slug: "categories", route: "/categories" },
      { slug: "blog", route: "/blog" },
      { slug: "legal", route: "/legal" },
      { slug: "contact", route: "/contact" },
      { slug: "info", route: "/info" },
      { slug: "promo", route: "/promo" },
      // TASK-549 — the unfiltered catalogue.
      { slug: "products", route: "/products" },
    ]);
  });

  it("treats the /info section pages like «Про нас»: canonical /info, no sitemap entry (TASK-560)", () => {
    expect(Object.values(INFO_HUB_SECTION_SLUGS)).toEqual([
      "info-delivery",
      "info-payment",
      "info-warranty",
      "info-about-stats",
    ]);
    for (const slug of [
      INFO_SLUG_INLINED_ON_HUB,
      ...Object.values(INFO_HUB_SECTION_SLUGS),
    ]) {
      expect(isInfoSlugInlinedOnHub(slug)).toBe(true);
      expect(pageRouteFor("INFO", slug)).toBeNull();
      expect(pageCanonicalPath("INFO", slug)).toBe("/info");
    }
    // Only INFO rows are inlined: a legal document may share the word.
    expect(pageRouteFor("LEGAL", "info-delivery")).toBe("/legal/info-delivery");
    expect(pageRouteFor("INFO", "returns-howto")).toBe("/info/returns-howto");
  });

  it("gives a products hub row no sitemap entry of its own", () => {
    // /products is already in the sitemap's static list; the row is meta tags.
    expect(hubRouteForSlug("products")).toBe("/products");
    expect(pageRouteFor("HUB", "products")).toBeNull();
  });
});
