import { buildListingMetadata } from "./listing-metadata";

/** Decision 2 — the one and only noindex shape a filtered listing ever gets. */
const NOINDEX_FOLLOW = { robots: { index: false, follow: true } };

describe("buildListingMetadata — base path + pagination (cases 1–5)", () => {
  it("case 1: bare base path → self-canonical", () => {
    expect(buildListingMetadata({ basePath: "/products" })).toEqual({
      canonicalPath: "/products",
    });
  });

  it("case 2: page 2 → canonical keeps ?page=2", () => {
    expect(buildListingMetadata({ basePath: "/products", page: 2 })).toEqual({
      canonicalPath: "/products?page=2",
    });
  });

  it("case 3: page 1 is omitted from the canonical", () => {
    expect(buildListingMetadata({ basePath: "/products", page: 1 })).toEqual({
      canonicalPath: "/products",
    });
  });

  it("case 4: page 0 (≤ 1) is omitted from the canonical", () => {
    expect(buildListingMetadata({ basePath: "/products", page: 0 })).toEqual({
      canonicalPath: "/products",
    });
  });

  it("case 5: NaN page is treated as page 1", () => {
    expect(buildListingMetadata({ basePath: "/products", page: NaN })).toEqual({
      canonicalPath: "/products",
    });
  });
});

describe("buildListingMetadata — filter params force noindex,follow (cases 6–16)", () => {
  it("case 6: search filter → noindex,follow without canonical", () => {
    expect(
      buildListingMetadata({
        basePath: "/products",
        filters: { search: "чохол" },
      }),
    ).toEqual(NOINDEX_FOLLOW);
  });

  it("case 7: minPrice filter → noindex,follow", () => {
    expect(
      buildListingMetadata({
        basePath: "/products",
        filters: { minPrice: "100" },
      }),
    ).toEqual(NOINDEX_FOLLOW);
  });

  it("case 8: multiple filters → same single noindex,follow output", () => {
    expect(
      buildListingMetadata({
        basePath: "/products",
        filters: { minPrice: "100", maxPrice: "500" },
      }),
    ).toEqual(NOINDEX_FOLLOW);
  });

  it("case 9: specs filter → noindex,follow", () => {
    expect(
      buildListingMetadata({
        basePath: "/products",
        filters: { specs: "material:Силікон" },
      }),
    ).toEqual(NOINDEX_FOLLOW);
  });

  it("case 10: brandId filter → noindex,follow", () => {
    expect(
      buildListingMetadata({
        basePath: "/products",
        filters: { brandId: "b1" },
      }),
    ).toEqual(NOINDEX_FOLLOW);
  });

  it("case 11: deviceModelId filter → noindex,follow", () => {
    expect(
      buildListingMetadata({
        basePath: "/products",
        filters: { deviceModelId: "m1" },
      }),
    ).toEqual(NOINDEX_FOLLOW);
  });

  it('case 12: onSale "true" → noindex,follow', () => {
    expect(
      buildListingMetadata({
        basePath: "/products",
        filters: { onSale: "true" },
      }),
    ).toEqual(NOINDEX_FOLLOW);
  });

  it('case 13: onSale "false" is not a present filter → self-canonical', () => {
    expect(
      buildListingMetadata({
        basePath: "/products",
        filters: { onSale: "false" },
      }),
    ).toEqual({ canonicalPath: "/products" });
  });

  it("case 14: empty-string filter value is treated as absent → self-canonical", () => {
    expect(
      buildListingMetadata({ basePath: "/products", filters: { search: "" } }),
    ).toEqual({ canonicalPath: "/products" });
  });

  it("case 15: explicit undefined filter values are absent → self-canonical", () => {
    expect(
      buildListingMetadata({
        basePath: "/products",
        filters: { search: undefined, minPrice: undefined },
      }),
    ).toEqual({ canonicalPath: "/products" });
  });

  it("case 16: filter wins over page — noindex,follow without ?page canonical", () => {
    expect(
      buildListingMetadata({
        basePath: "/products",
        filters: { search: "чохол" },
        page: 3,
      }),
    ).toEqual(NOINDEX_FOLLOW);
  });
});

describe("buildListingMetadata — category landing base path (cases 17–19)", () => {
  it("case 17: bare category landing → self-canonical", () => {
    expect(
      buildListingMetadata({ basePath: "/categories/apple-cases" }),
    ).toEqual({ canonicalPath: "/categories/apple-cases" });
  });

  it("case 18: category landing page 2 → canonical keeps ?page=2", () => {
    expect(
      buildListingMetadata({ basePath: "/categories/apple-cases", page: 2 }),
    ).toEqual({ canonicalPath: "/categories/apple-cases?page=2" });
  });

  it("case 19: filtered category landing → noindex,follow", () => {
    expect(
      buildListingMetadata({
        basePath: "/categories/apple-cases",
        filters: { minPrice: "100" },
      }),
    ).toEqual(NOINDEX_FOLLOW);
  });
});

describe("buildListingMetadata — categoryCanonicalPath redirect (cases 20–23)", () => {
  it("case 20: category selected, no other filter → canonical is the category landing", () => {
    expect(
      buildListingMetadata({
        basePath: "/products",
        categoryCanonicalPath: "/categories/apple-cases",
      }),
    ).toEqual({ canonicalPath: "/categories/apple-cases" });
  });

  it("case 21: category redirect keeps ?page=N on the category landing", () => {
    expect(
      buildListingMetadata({
        basePath: "/products",
        categoryCanonicalPath: "/categories/apple-cases",
        page: 2,
      }),
    ).toEqual({ canonicalPath: "/categories/apple-cases?page=2" });
  });

  it("case 22: filter beats the category redirect → noindex,follow, categoryCanonicalPath ignored", () => {
    expect(
      buildListingMetadata({
        basePath: "/products",
        categoryCanonicalPath: "/categories/apple-cases",
        filters: { minPrice: "100" },
      }),
    ).toEqual(NOINDEX_FOLLOW);
  });

  it("case 23: filter + page + category all present → still just noindex,follow", () => {
    expect(
      buildListingMetadata({
        basePath: "/products",
        categoryCanonicalPath: "/categories/apple-cases",
        filters: { minPrice: "100" },
        page: 3,
      }),
    ).toEqual(NOINDEX_FOLLOW);
  });
});

describe("buildListingMetadata — empty filters object (case 24)", () => {
  it("case 24: empty filters object with no category ≠ any filter present → self-canonical", () => {
    expect(
      buildListingMetadata({
        basePath: "/products",
        categoryCanonicalPath: undefined,
        filters: {},
      }),
    ).toEqual({ canonicalPath: "/products" });
  });
});
