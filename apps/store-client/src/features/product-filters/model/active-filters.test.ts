import {
  CATALOG_FILTER_KEYS,
  activeFilterKeys,
  clearFilterUpdates,
  countActiveFilters,
  hasActiveFilters,
} from "./active-filters";

/**
 * TASK-414. Four controls used to answer "which filters are active?" four
 * different ways, and none of them knew about `specs`. These tests pin the ONE
 * answer, and — via the completeness check at the bottom — make a newly added
 * filter param fail here first rather than silently escape the badge, the reset
 * button and the noindex rule.
 */
describe("catalog active-filter helpers", () => {
  it("counts nothing on an unfiltered listing", () => {
    expect(countActiveFilters({ page: 1, limit: 20 })).toBe(0);
    expect(hasActiveFilters({ page: 1, limit: 20 })).toBe(false);
  });

  it("ignores sort, view, pagination and the forced isActive flag", () => {
    const params = {
      page: 3,
      limit: 20,
      sortBy: "price",
      sortOrder: "asc" as const,
      isActive: true,
    };

    expect(countActiveFilters(params)).toBe(0);
  });

  it("counts every filter the panel and the chips row can set", () => {
    const params = {
      page: 1,
      limit: 20,
      search: "чохол",
      // Slugs since TASK-420 — this list IS the URL contract.
      category: "phone-cases",
      brand: "apple",
      device: "iphone-15",
      minPrice: 100,
      maxPrice: 900,
      specs: "material:Силікон,TPU;form:Накладка",
      inStock: true,
    };

    expect(countActiveFilters(params)).toBe(CATALOG_FILTER_KEYS.length);
    expect(activeFilterKeys(params)).toEqual([...CATALOG_FILTER_KEYS]);
  });

  // The old badge missed `specs` entirely: a shopper could have two facets
  // applied and see no indication at all in the mobile toolbar.
  it("counts the spec facets (the filter the old badge omitted)", () => {
    expect(
      countActiveFilters({ page: 1, limit: 20, specs: "material:Силікон" }),
    ).toBe(1);
  });

  it("excludes the category when asked (its control is the chips row / the route)", () => {
    const params = {
      page: 1,
      limit: 20,
      category: "phone-cases",
      search: "чохол",
    };

    expect(countActiveFilters(params)).toBe(2);
    expect(countActiveFilters(params, { includeCategory: false })).toBe(1);
  });

  // TASK-490 — on a compat landing page the device is the second URL SEGMENT,
  // not a filter the drawer can change; badging it would promise a control the
  // panel does not render.
  it("excludes the device when the route owns it", () => {
    const params = {
      page: 1,
      limit: 20,
      category: "chohly",
      device: "iphone-15-pro",
      brand: "apple",
    };

    expect(countActiveFilters(params)).toBe(3);
    expect(
      countActiveFilters(params, {
        includeCategory: false,
        includeDevice: false,
      }),
    ).toBe(1);
  });

  it("treats an empty string as no filter", () => {
    expect(
      countActiveFilters({ page: 1, limit: 20, search: "", specs: "" }),
    ).toBe(0);
  });

  // `inStock` is boolean-shaped: `false` is "no availability filter", not
  // "filter to out-of-stock" — the same rule the API's transform applies.
  it("counts inStock only when it is true", () => {
    expect(countActiveFilters({ page: 1, limit: 20, inStock: true })).toBe(1);
    expect(countActiveFilters({ page: 1, limit: 20, inStock: false })).toBe(0);
  });

  describe("clearFilterUpdates", () => {
    it("clears the FULL set, not only what is currently active", () => {
      expect(clearFilterUpdates()).toEqual({
        search: undefined,
        category: undefined,
        brand: undefined,
        device: undefined,
        minPrice: undefined,
        maxPrice: undefined,
        specs: undefined,
        inStock: undefined,
      });
    });

    it("keeps the category out of the updates when it is locked/owned elsewhere", () => {
      const updates = clearFilterUpdates({ includeCategory: false });

      expect("category" in updates).toBe(false);
      expect(updates.specs).toBeUndefined();
      expect("inStock" in updates).toBe(true);
    });

    // TASK-490 — `/catalog/[category]/[device]` locks BOTH taxonomy segments.
    // A reset that dropped the device would leave the page listing the whole
    // category under an «… для iPhone 15 Pro» heading.
    it("keeps the device out of the updates when the route owns it", () => {
      const updates = clearFilterUpdates({
        includeCategory: false,
        includeDevice: false,
      });

      expect("device" in updates).toBe(false);
      expect("category" in updates).toBe(false);
      expect("brand" in updates).toBe(true);
      expect("specs" in updates).toBe(true);
    });

    // A reset that does not clear everything the panel can set is the exact
    // defect this replaces: device, specs and availability survived it.
    it("clears every key the counter knows about", () => {
      expect(Object.keys(clearFilterUpdates()).sort()).toEqual(
        [...CATALOG_FILTER_KEYS].sort(),
      );
    });
  });
});
