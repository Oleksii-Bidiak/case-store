import {
  HUB_PAGES,
  INFO_SLUGS_INLINED_ON_HUB,
  hubRouteForSlug,
  isInlinedOnInfoHub,
  pagePreviewPath,
  pageSitePath,
} from "./hub-pages";

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

  it("pins the INFO slugs /info renders inline — the storefront's list (TASK-565)", () => {
    expect(INFO_SLUGS_INLINED_ON_HUB).toEqual([
      "about",
      "info-delivery",
      "info-payment",
      "info-warranty",
      "info-about-stats",
    ]);
    expect(isInlinedOnInfoHub("INFO", "about")).toBe(true);
    // Only the INFO row: a legal document or a hub may share the word.
    expect(isInlinedOnInfoHub("LEGAL", "about")).toBe(false);
    expect(isInlinedOnInfoHub("INFO", "returns-howto")).toBe(false);
  });

  it("previews a products hub row at /products, not under /legal", () => {
    expect(hubRouteForSlug("products")).toBe("/products");
    expect(pagePreviewPath("HUB", "products")).toBe("/products");
  });

  it("puts an inlined INFO row on /info itself — the address it is seen at (wave 198)", () => {
    expect(pageSitePath("INFO", "info-delivery")).toBe("/info");
    expect(pageSitePath("INFO", "returns-howto")).toBe("/info/returns-howto");
    expect(pageSitePath("LEGAL", "delivery")).toBe("/legal/delivery");
    expect(pageSitePath("HUB", "promo")).toBe("/promo");
    expect(pageSitePath("HUB", "nowhere")).toBeNull();
  });
});
