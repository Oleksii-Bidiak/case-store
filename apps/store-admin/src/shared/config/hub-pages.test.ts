import { HUB_PAGES, hubRouteForSlug, pagePreviewPath } from "./hub-pages";

/**
 * The panel's copy of the hub table (TASK-435). The API
 * (`apps/store-api/src/pages/hub-routes.ts`) and the storefront
 * (`apps/store-client/src/shared/config/hub-pages.ts`) keep the same pairs, each
 * pinned by its own test — a hub added in one app and not here would be a slug
 * the API accepts that this form cannot offer.
 */
describe("HUB_PAGES", () => {
  it("pins the seven hubs in storefront-navigation order", () => {
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

  it("previews a products hub row at /products, not under /legal", () => {
    expect(hubRouteForSlug("products")).toBe("/products");
    expect(pagePreviewPath("HUB", "products")).toBe("/products");
  });
});
