// The route renders PromoView (a client tree); these tests only read the element
// tree the page returns, so the view is stubbed — the params builder is real.
jest.mock("@/widgets/promo", () => ({
  PromoView: () => null,
  buildPromoDealsParams: jest.requireActual(
    "@/widgets/promo/model/deals-params",
  ).buildPromoDealsParams,
}));
jest.mock("@/shared/api/pages-server", () => ({
  fetchPublishedPage: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/shared/api/seo-settings-server", () => ({
  fetchSeoSettings: jest.fn().mockResolvedValue(null),
}));
// The server prefetch (TASK-563) — options builders stubbed with the generated
// key shapes, so the reads are assertable mocks rather than axios.
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
jest.mock("@/shared/api/generated/categories/categories", () => {
  const getRoots = jest.fn().mockResolvedValue({ data: [], meta: {} });
  return {
    categoryControllerGetRootCategories: getRoots,
    getCategoryControllerGetRootCategoriesQueryOptions: (params: unknown) => ({
      queryKey: ["/api/categories", params],
      queryFn: () => getRoots(params),
    }),
  };
});

import { productControllerFindAll } from "@/shared/api/generated/products/products";
import { ACTIVE_ROOT_CATEGORIES_PARAMS } from "@/entities/category";
import { SITE_URL } from "@/shared/config";
import {
  findDehydratedQueryKeys,
  findJsonLdSchemas,
} from "@/shared/test/element-tree";
import { buildPromoDealsParams } from "@/widgets/promo/model/deals-params";
import PromoPage, { revalidate } from "./page";

const findAll = productControllerFindAll as jest.MockedFunction<
  typeof productControllerFindAll
>;

afterEach(() => jest.clearAllMocks());

describe("/promo — the first HTML carries the deals (TASK-563)", () => {
  it("prefetches the «Усі» tab and the category tabs under the grid's keys", async () => {
    const tree = await PromoPage();

    expect(findDehydratedQueryKeys(tree)).toEqual([
      ["/api/products", buildPromoDealsParams(null)],
      ["/api/categories", ACTIVE_ROOT_CATEGORIES_PARAMS],
    ]);
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

    const tree = await PromoPage();

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

    const tree = await PromoPage();

    expect(findJsonLdSchemas(tree).map((schema) => schema["@type"])).toEqual([
      "BreadcrumbList",
    ]);
    expect(findDehydratedQueryKeys(tree)).toEqual([
      ["/api/categories", ACTIVE_ROOT_CATEGORIES_PARAMS],
    ]);
  });

  it("is prerendered with an hourly floor, so a copy baked without the API heals", () => {
    expect(revalidate).toBe(3600);
  });
});
