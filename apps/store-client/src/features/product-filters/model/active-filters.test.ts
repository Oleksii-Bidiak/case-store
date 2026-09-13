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
      categoryId: "cat-1",
      brandId: "brand-1",
      deviceModelId: "model-1",
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
    const params = { page: 1, limit: 20, categoryId: "cat-1", search: "чохол" };

    expect(countActiveFilters(params)).toBe(2);
    expect(countActiveFilters(params, { includeCategory: false })).toBe(1);
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
        categoryId: undefined,
        brandId: undefined,
        deviceModelId: undefined,
        minPrice: undefined,
        maxPrice: undefined,
        specs: undefined,
        inStock: undefined,
      });
    });

    it("keeps the category out of the updates when it is locked/owned elsewhere", () => {
      const updates = clearFilterUpdates({ includeCategory: false });

      expect("categoryId" in updates).toBe(false);
      expect(updates.specs).toBeUndefined();
      expect("inStock" in updates).toBe(true);
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
