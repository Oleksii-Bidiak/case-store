import { HUB_PAGES, hubRouteForSlug, pageRouteFor } from "./hub-pages";

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

  it("gives a products hub row no sitemap entry of its own", () => {
    // /products is already in the sitemap's static list; the row is meta tags.
    expect(hubRouteForSlug("products")).toBe("/products");
    expect(pageRouteFor("HUB", "products")).toBeNull();
  });
});
