import { hashKey } from "@tanstack/react-query";
import { getProductControllerFindAllQueryKey } from "@/shared/api/generated/products/products";
import {
  buildCatalogListingParams,
  readSearchParamsRecord,
} from "./listing-params";

/** The client's reader: exactly what `useSearchParams().get` returns. */
const fromUrl = (query: string) => {
  const search = new URLSearchParams(query);
  return (key: string) => search.get(key);
};

/** The server's reader over `await searchParams` for the same URL. */
const fromRecord = (query: string) => {
  const record: Record<string, string | string[]> = {};
  for (const [key, value] of new URLSearchParams(query)) {
    const existing = record[key];
    record[key] =
      existing === undefined
        ? value
        : Array.isArray(existing)
          ? [...existing, value]
          : [existing, value];
  }
  return readSearchParamsRecord(record);
};

/** React Query's own identity for the listing query of these params. */
const cacheKey = (params: ReturnType<typeof buildCatalogListingParams>) =>
  hashKey(getProductControllerFindAllQueryKey(params));

describe("buildCatalogListingParams (TASK-563)", () => {
  it("defaults an empty URL to the newest-first first page of active products", () => {
    expect(buildCatalogListingParams(fromUrl(""))).toEqual({
      sortBy: "createdAt",
      sortOrder: "desc",
      page: 1,
      limit: 20,
      isActive: true,
    });
  });

  it("reads every filter the listing offers", () => {
    const params = buildCatalogListingParams(
      fromUrl(
        "category=chohly&brand=apple&device=iphone-15&search=магніт&sortBy=price&sortOrder=asc" +
          "&minPrice=100&maxPrice=900&specs=material:silicone&inStock=true&onSale=true&page=3",
      ),
    );

    expect(params).toEqual({
      category: "chohly",
      brand: "apple",
      device: "iphone-15",
      search: "магніт",
      sortBy: "price",
      sortOrder: "asc",
      minPrice: 100,
      maxPrice: 900,
      specs: "material:silicone",
      inStock: true,
      onSale: true,
      page: 3,
      limit: 20,
      isActive: true,
    });
  });

  it("trims the search term and treats a blank one as no search", () => {
    expect(buildCatalogListingParams(fromUrl("search=%20кейс%20")).search).toBe(
      "кейс",
    );
    expect(
      buildCatalogListingParams(fromUrl("search=%20%20")).search,
    ).toBeUndefined();
  });

  it('filters on availability and discount only for the literal "true"', () => {
    const params = buildCatalogListingParams(fromUrl("inStock=false&onSale=1"));
    expect(params.inStock).toBeUndefined();
    expect(params.onSale).toBeUndefined();
  });

  it("reads empty values as absent, not as empty filters", () => {
    const params = buildCatalogListingParams(
      fromUrl("specs=&brand=&sortBy=&page="),
    );
    expect(params.specs).toBeUndefined();
    expect(params.brand).toBeUndefined();
    expect(params.sortBy).toBe("createdAt");
    expect(params.page).toBe(1);
  });

  it("lets a route lock win over the query string", () => {
    const params = buildCatalogListingParams(
      fromUrl("category=other&device=other-phone"),
      { categorySlug: "chohly", deviceSlug: "iphone-15" },
    );
    expect(params.category).toBe("chohly");
    expect(params.device).toBe("iphone-15");
  });

  // TASK-1301 — `/promo` is the on-sale slice of the catalogue: neither a
  // missing nor a hand-edited `?onSale=false` can widen it to full-price stock.
  it.each(["", "onSale=false", "onSale=true"])(
    "keeps the discount lock on for ?%s",
    (query) => {
      expect(
        buildCatalogListingParams(fromUrl(query), { onSale: true }).onSale,
      ).toBe(true);
    },
  );

  it("gives the locked server and client one cache key", () => {
    const query = "category=chohly&page=2";
    expect(
      cacheKey(buildCatalogListingParams(fromRecord(query), { onSale: true })),
    ).toBe(
      cacheKey(buildCatalogListingParams(fromUrl(query), { onSale: true })),
    );
  });

  // The property the whole prefetch rests on: the server (awaited
  // `searchParams` record) and the client (`useSearchParams`) reading one URL
  // land on ONE React Query cache entry. A differing key is a skeleton over the
  // server's cards — a hydration mismatch.
  it.each([
    "",
    "category=chohly",
    "search=%20case%20&page=2",
    "brand=apple&brand=samsung",
    "specs=&minPrice=&inStock=false",
    "sortBy=price&sortOrder=asc&onSale=true&maxPrice=500",
  ])("gives the server and the client the same cache key for ?%s", (query) => {
    expect(cacheKey(buildCatalogListingParams(fromRecord(query)))).toBe(
      cacheKey(buildCatalogListingParams(fromUrl(query))),
    );
  });

  it("takes the first value of a repeated parameter on both sides", () => {
    expect(
      buildCatalogListingParams(fromRecord("brand=apple&brand=samsung")).brand,
    ).toBe("apple");
  });
});
