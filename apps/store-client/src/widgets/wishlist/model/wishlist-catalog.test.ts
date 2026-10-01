import type { WishlistItemEntity } from "@/entities/wishlist";
import {
  EMPTY_WISHLIST_FILTERS,
  collectFacetOptions,
  countActiveWishlistFilters,
  filterWishlistItems,
  paginateWishlist,
  parsePageParam,
  sortWishlistItems,
  wishlistPriceDomain,
  type WishlistItemFacets,
} from "./wishlist-catalog";

function item(
  id: string,
  price: string,
  overrides: Partial<WishlistItemEntity> = {},
): WishlistItemEntity {
  return {
    id,
    productId: id,
    productName: `Product ${id}`,
    productSlug: `product-${id}`,
    imageUrl: null,
    price,
    compareAtPrice: null,
    maxQty: 5,
    isActive: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

const cheapCase = item("a", "300", {
  compareAtPrice: "400",
  createdAt: "2026-06-03T00:00:00.000Z",
});
const cable = item("b", "900", { createdAt: "2026-06-02T00:00:00.000Z" });
const headphones = item("c", "9999", {
  compareAtPrice: "11499",
  maxQty: 0,
  createdAt: "2026-06-01T00:00:00.000Z",
});
const items = [cable, headphones, cheapCase];

const facets = new Map<string, WishlistItemFacets>([
  ["a", { categoryId: "cases", brandId: "spigen", brandName: "Spigen" }],
  ["b", { categoryId: "cables", brandId: "apple", brandName: "Apple" }],
  ["c", { categoryId: "audio", brandId: "apple", brandName: "Apple" }],
]);

describe("filterWishlistItems (TASK-1300)", () => {
  it("returns everything with no filter set", () => {
    expect(filterWishlistItems(items, EMPTY_WISHLIST_FILTERS, facets)).toEqual(
      items,
    );
  });

  it("ORs within a section and ANDs across sections", () => {
    const result = filterWishlistItems(
      items,
      {
        ...EMPTY_WISHLIST_FILTERS,
        categoryIds: ["cables", "audio"],
        brandIds: ["apple"],
        inStockOnly: true,
      },
      facets,
    );
    // Both Apple items are in the ticked categories; only the cable is in stock.
    expect(result).toEqual([cable]);
  });

  it("filters by the price bounds inclusively", () => {
    const result = filterWishlistItems(
      items,
      { ...EMPTY_WISHLIST_FILTERS, minPrice: 300, maxPrice: 900 },
      facets,
    );
    expect(result).toEqual([cable, cheapCase]);
  });

  it("never matches an item whose facets are unknown against a category/brand filter", () => {
    const result = filterWishlistItems(
      items,
      { ...EMPTY_WISHLIST_FILTERS, brandIds: ["apple"] },
      new Map(), // cards not loaded / product withdrawn
    );
    expect(result).toEqual([]);
  });
});

describe("sortWishlistItems (TASK-1300)", () => {
  it("defaults to the most recently saved first", () => {
    expect(sortWishlistItems(items, "createdAt:desc")).toEqual([
      cheapCase,
      cable,
      headphones,
    ]);
  });

  it("sorts by price both ways", () => {
    expect(sortWishlistItems(items, "price:asc")).toEqual([
      cheapCase,
      cable,
      headphones,
    ]);
    expect(sortWishlistItems(items, "price:desc")).toEqual([
      headphones,
      cable,
      cheapCase,
    ]);
  });

  it("sorts by the size of the discount, undiscounted last", () => {
    // cheapCase −25 %, headphones −13 %, cable none.
    expect(sortWishlistItems(items, "discount:desc")).toEqual([
      cheapCase,
      headphones,
      cable,
    ]);
  });
});

describe("collectFacetOptions (TASK-1300)", () => {
  it("counts each value over the list, most frequent first", () => {
    const brands = collectFacetOptions(items, facets, (f) =>
      f.brandId && f.brandName
        ? { id: f.brandId, label: f.brandName }
        : undefined,
    );
    expect(brands).toEqual([
      { id: "apple", label: "Apple", count: 2 },
      { id: "spigen", label: "Spigen", count: 1 },
    ]);
  });
});

describe("countActiveWishlistFilters (TASK-1300)", () => {
  it("counts one per chip — each ticked value, the price range once", () => {
    expect(
      countActiveWishlistFilters({
        ...EMPTY_WISHLIST_FILTERS,
        saleOnly: true,
        brandIds: ["apple", "spigen"],
        minPrice: 100,
        maxPrice: 900,
      }),
    ).toBe(4);
  });
});

describe("wishlistPriceDomain (TASK-1300)", () => {
  it("rounds the priciest item up to the next thousand, never below 1 000", () => {
    expect(wishlistPriceDomain(items)).toBe(10000);
    expect(wishlistPriceDomain([item("x", "120")])).toBe(1000);
  });
});

describe("paginateWishlist / parsePageParam (TASK-1300)", () => {
  const many = Array.from({ length: 30 }, (_, i) => item(`i${i}`, "100"));

  it("reads a missing or invalid ?page= as the first page", () => {
    expect(parsePageParam(null)).toBe(1);
    expect(parsePageParam("abc")).toBe(1);
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("3")).toBe(3);
  });

  it("slices a page and counts what «Показати ще» would add", () => {
    const page = paginateWishlist(many, 1, 0, 12);
    expect(page.items).toHaveLength(12);
    expect(page.totalPages).toBe(3);
    expect(page.nextCount).toBe(12);
  });

  it("appends pages after the base page and stops at the remainder", () => {
    const page = paginateWishlist(many, 2, 1, 12);
    expect(page.items[0]).toBe(many[12]);
    expect(page.items).toHaveLength(18);
    expect(page.nextCount).toBe(0);
  });

  it("clamps a page past the end (the list shrank) to the last page", () => {
    const page = paginateWishlist(many.slice(0, 5), 4, 0, 12);
    expect(page.currentPage).toBe(1);
    expect(page.items).toHaveLength(5);
  });
});
