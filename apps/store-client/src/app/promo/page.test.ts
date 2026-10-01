// The route renders PromoView and the catalogue listing (client trees); these
// tests only read the element tree the page returns, so the views are stubbed —
// the params builder is real (TASK-1301).
jest.mock("@/widgets/promo", () => ({
  PromoView: () => null,
  PROMO_DEALS_ANCHOR: "deals",
}));
jest.mock("@/widgets/product-list", () => {
  const listing = jest.requireActual(
    "@/widgets/product-list/model/listing-params",
  );
  return {
    ProductListView: () => null,
    ProductListSkeleton: () => null,
    buildCatalogListingParams: listing.buildCatalogListingParams,
    readSearchParamsRecord: listing.readSearchParamsRecord,
  };
});
jest.mock("@/shared/api/pages-server", () => ({
  fetchPublishedPage: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/shared/api/seo-settings-server", () => ({
  fetchSeoSettings: jest.fn().mockResolvedValue(null),
}));
// The server prefetch (TASK-563) — options builder stubbed with the generated
// key shape, so the read is an assertable mock rather than axios.
jest.mock("@/shared/api/generated/products/products", () => {
  const findAll = jest.fn().mockResolvedValue({ data: [], meta: {} });
  return {
    productControllerFindAll: findAll,
    getProductControllerFindAllQueryOptions: (params: unknown) => ({
      queryKey: ["/api/products", params],
      queryFn: () => findAll(params),
    }),
  };
});

import { productControllerFindAll } from "@/shared/api/generated/products/products";
import { SITE_URL } from "@/shared/config";
import {
  findDehydratedQueryKeys,
  findJsonLdSchemas,
  findPropValues,
} from "@/shared/test/element-tree";
import {
  buildCatalogListingParams,
  readSearchParamsRecord,
} from "@/widgets/product-list/model/listing-params";
import PromoPage, { generateMetadata } from "./page";

const findAll = productControllerFindAll as jest.MockedFunction<
  typeof productControllerFindAll
>;

type Query = { [key: string]: string | string[] | undefined };

const render = (query: Query = {}) =>
  PromoPage({ searchParams: Promise.resolve(query) });

/** The key the client view builds for the same URL, with the same lock. */
const lockedParams = (query: Query = {}) =>
  buildCatalogListingParams(readSearchParamsRecord(query), { onSale: true });

afterEach(() => jest.clearAllMocks());

describe("/promo — the deals are the catalogue with a discount lock (TASK-1301)", () => {
  it("prefetches the locked listing under the key the client view reads", async () => {
    const tree = await render();

    expect(findDehydratedQueryKeys(tree)).toEqual([
      ["/api/products", lockedParams()],
    ]);
    expect(lockedParams()).toMatchObject({
      onSale: true,
      sortBy: "createdAt",
      sortOrder: "desc",
      page: 1,
    });
  });

  it("follows the URL's filters and page, but never lets it lift the lock", async () => {
    const query = { category: "navushnyky", page: "2", onSale: "false" };

    const tree = await render(query);

    expect(findDehydratedQueryKeys(tree)).toEqual([
      ["/api/products", lockedParams(query)],
    ]);
    expect(findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "navushnyky",
        page: 2,
        onSale: true,
      }),
    );
  });

  it("renders the listing with the discount lock", async () => {
    const tree = await render();

    // Handed to PromoView through its `deals` slot, under the deals heading.
    const deals = findPropValues(tree, "deals");
    expect(findPropValues(deals, "lockedOnSale")).toEqual([true]);
    expect(findPropValues(deals, "anchorId")).toEqual(["deals"]);
  });

  it("describes the prefetched deals as an ItemList", async () => {
    findAll.mockResolvedValueOnce({
      data: [
        {
          id: "p1",
          name: "Чохол зі знижкою",
          slug: "chohol-sale",
          primaryImage: { url: "https://cdn.example.com/p1.jpg" },
        },
      ],
      meta: {},
    } as never);

    const tree = await render();

    const itemList = findJsonLdSchemas(tree).find(
      (schema) => schema["@type"] === "ItemList",
    );
    expect(itemList?.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        item: {
          "@type": "Product",
          name: "Чохол зі знижкою",
          url: `${SITE_URL}/products/chohol-sale`,
          image: "https://cdn.example.com/p1.jpg",
        },
      },
    ]);
  });

  it("renders the breadcrumb alone when the deals cannot be read", async () => {
    findAll.mockRejectedValueOnce(new Error("timeout of 5000ms exceeded"));

    const tree = await render();

    expect(findJsonLdSchemas(tree).map((schema) => schema["@type"])).toEqual([
      "BreadcrumbList",
    ]);
    expect(findDehydratedQueryKeys(tree)).toEqual([]);
  });
});

describe("/promo metadata — the listing's canonical / noindex policy", () => {
  const meta = (query: Query = {}) =>
    generateMetadata({ searchParams: Promise.resolve(query) });

  it("is its own canonical when clean, page included", async () => {
    expect((await meta()).alternates?.canonical).toBe(`${SITE_URL}/promo`);
    expect((await meta({ page: "2" })).alternates?.canonical).toBe(
      `${SITE_URL}/promo?page=2`,
    );
    expect((await meta()).robots).toBeUndefined();
  });

  it("is noindex, follow under a filter", async () => {
    const filtered = await meta({ brand: "apple" });

    expect(filtered.robots).toEqual({ index: false, follow: true });
  });
});
