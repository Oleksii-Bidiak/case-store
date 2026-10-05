import { FILTER_SECTION_ORDER, filterRailSections } from "./filter-sections";

/**
 * TASK-515. The rail's section list is what the catalogue skeleton draws its
 * placeholder cards from, so every route variant must answer here exactly as
 * `ProductFilters` renders it.
 */
describe("filterRailSections", () => {
  it("lists the six always-on sections on the default /products view", () => {
    expect(filterRailSections()).toEqual([
      "search",
      "availability",
      "onSale",
      "brand",
      "device",
      "price",
    ]);
  });

  it("adds «Характеристики» last once a category is set", () => {
    expect(filterRailSections({ hasCategory: true })).toEqual([
      ...FILTER_SECTION_ORDER,
    ]);
  });

  it("drops the device section where the route fixes the device", () => {
    expect(
      filterRailSections({ lockedDevice: true, hasCategory: true }),
    ).not.toContain("device");
  });

  it("drops «Знижки» on /promo, where the route fixes the discount", () => {
    expect(filterRailSections({ lockedOnSale: true })).toEqual([
      "search",
      "availability",
      "brand",
      "device",
      "price",
    ]);
  });

  it("drops «Знижки» and the spec facets for /search", () => {
    expect(
      filterRailSections({
        hideOnSale: true,
        hideSpecFacets: true,
        hasCategory: true,
      }),
    ).toEqual(["search", "availability", "brand", "device", "price"]);
  });
});
