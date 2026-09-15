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

  it("case 10: brand filter → noindex,follow", () => {
    expect(
      buildListingMetadata({
        basePath: "/products",
        filters: { brand: "apple" },
      }),
    ).toEqual(NOINDEX_FOLLOW);
  });

  it("case 11: device filter → noindex,follow", () => {
    expect(
      buildListingMetadata({
        basePath: "/products",
        filters: { device: "iphone-15" },
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

  it('case 13a: inStock "true" → noindex,follow', () => {
    expect(
      buildListingMetadata({
        basePath: "/products",
        filters: { inStock: "true" },
      }),
    ).toEqual(NOINDEX_FOLLOW);
  });

  it('case 13b: inStock "false" is not a present filter → self-canonical', () => {
    expect(
      buildListingMetadata({
        basePath: "/products",
        filters: { inStock: "false" },
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

describe("buildListingMetadata — slug-shaped filters (cases 25–26, TASK-420)", () => {
  // The canonical a listing points at must be spelled the way the listing is
  // addressed. When `?brandId=` became `?brand=`, a `ListingFilterParams` that
  // still read `brandId` would have gone on compiling and silently stopped
  // noindexing every brand-filtered page — a whole facet of the catalogue
  // competing with the unfiltered listing in the index.
  it("case 25: a category slug alone still canonicalizes onto the landing page", () => {
    expect(
      buildListingMetadata({
        basePath: "/products",
        categoryCanonicalPath: "/categories/apple-cases",
        filters: { brand: undefined, device: undefined },
      }),
    ).toEqual({ canonicalPath: "/categories/apple-cases" });
  });

  it("case 26: brand or device beats the category redirect → noindex,follow", () => {
    expect(
      buildListingMetadata({
        basePath: "/products",
        categoryCanonicalPath: "/categories/apple-cases",
        filters: { brand: "apple" },
      }),
    ).toEqual(NOINDEX_FOLLOW);
    expect(
      buildListingMetadata({
        basePath: "/products",
        categoryCanonicalPath: "/categories/apple-cases",
        filters: { device: "iphone-15" },
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

describe("buildListingMetadata — compatibility landing pages (cases 27–31, TASK-490)", () => {
  const COMPAT = "/catalog/chohly/iphone-15-pro";
  const CATEGORY = "/categories/chohly";

  it("case 27: the UNFILTERED compat page is self-canonical and indexable", () => {
    // Not the category: `/catalog/<категорія>/<модель>` is the ONE facet
    // combination with an address of its own (owner decision B-10 §5), so it
    // competes for the index rather than handing its equity to the category.
    expect(
      buildListingMetadata({
        basePath: COMPAT,
        filteredCanonicalPath: CATEGORY,
      }),
    ).toEqual({ canonicalPath: COMPAT });
  });

  it("case 28: page 2 of an unfiltered compat page keeps ?page=2 on itself", () => {
    expect(
      buildListingMetadata({
        basePath: COMPAT,
        filteredCanonicalPath: CATEGORY,
        page: 2,
      }),
    ).toEqual({ canonicalPath: `${COMPAT}?page=2` });
  });

  it("case 29: ?specs= on a compat page → noindex,follow AND canonical to the category", () => {
    // The acceptance criterion of plan 182 item 490, and the ONE place the
    // house rule "never a canonical together with noindex" is relaxed: the
    // consolidation target is a different PATH, which no amount of
    // param-stripping would reach on its own.
    expect(
      buildListingMetadata({
        basePath: COMPAT,
        filteredCanonicalPath: CATEGORY,
        filters: { specs: "material:Силікон" },
      }),
    ).toEqual({ ...NOINDEX_FOLLOW, canonicalPath: CATEGORY });
  });

  it("case 30: any other facet does the same, and the page number is dropped", () => {
    // A filtered view consolidates onto ONE url, never a paginated one —
    // `?page=3` of a filtered slice has no counterpart on the category.
    for (const filters of [
      { brand: "apple" },
      { minPrice: "100" },
      { inStock: "true" },
      { onSale: "true" },
      { search: "чохол" },
      // A second, contradicting device in the QUERY — the segment already names
      // one, so this can only be a stale or hand-edited URL.
      { device: "galaxy-s24" },
    ]) {
      expect(
        buildListingMetadata({
          basePath: COMPAT,
          filteredCanonicalPath: CATEGORY,
          filters,
          page: 3,
        }),
      ).toEqual({ ...NOINDEX_FOLLOW, canonicalPath: CATEGORY });
    }
  });

  it("case 31: without the opt-in, a filtered listing still gets NO canonical", () => {
    // The exception is confined to the route that asks for it: `/products` and
    // `/categories/[slug]` keep emitting the bare noindex.
    expect(
      buildListingMetadata({
        basePath: "/categories/chohly",
        filters: { specs: "material:Силікон" },
      }),
    ).toEqual(NOINDEX_FOLLOW);
  });
});
