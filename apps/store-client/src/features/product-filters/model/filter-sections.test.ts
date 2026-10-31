import { FILTER_SECTION_ORDER, filterRailSections } from "./filter-sections";

/**
 * TASK-515. The rail's section list is what the catalogue skeleton draws its
 * placeholder cards from, so every route variant must answer here exactly as
 * `ProductFilters` renders it.
 */
describe("filterRailSections", () => {
  it("lists the five always-on sections in the panel order of Д3-2 Catalog §12", () => {
    expect(filterRailSections()).toEqual([
      "availability",
      "price",
      "onSale",
      "brand",
      "device",
    ]);
  });

  it("adds «Характеристики» last once a category is set", () => {
    expect(filterRailSections({ hasCategory: true })).toEqual(
      FILTER_SECTION_ORDER.filter((section) => section !== "myDevices"),
    );
  });

  it("puts «З урахуванням моїх пристроїв» first when offered (TASK-2077)", () => {
    expect(
      filterRailSections({ withMyDevices: true, hasCategory: true }),
    ).toEqual([...FILTER_SECTION_ORDER]);
  });

  it("never offers my devices where the route fixes the device", () => {
    expect(
      filterRailSections({ withMyDevices: true, lockedDevice: true }),
    ).not.toContain("myDevices");
  });

  it("drops the device section where the route fixes the device", () => {
    expect(
      filterRailSections({ lockedDevice: true, hasCategory: true }),
    ).not.toContain("device");
  });

  it("drops «Знижки» on /promo, where the route fixes the discount", () => {
    expect(filterRailSections({ lockedOnSale: true })).toEqual([
      "availability",
      "price",
      "brand",
      "device",
    ]);
  });

  it("drops «Знижки» and the spec facets for /search", () => {
    expect(
      filterRailSections({
        hideOnSale: true,
        hideSpecFacets: true,
        hasCategory: true,
      }),
    ).toEqual(["availability", "price", "brand", "device"]);
  });
});
