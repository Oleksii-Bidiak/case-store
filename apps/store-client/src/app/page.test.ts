// The home page imports the widgets barrel (heavy client trees) and three
// server fetchers. The widgets are stubbed; the rail's tab model is real, since
// it decides what the page prefetches (TASK-563).
jest.mock("@/widgets", () => ({
  HeroBanner: () => null,
  TrustStrip: () => null,
  CategoryNav: () => null,
  PopularRail: () => null,
  RecommendationCarousels: () => null,
  PromoBanner: () => null,
  RecentlyViewed: () => null,
  Newsletter: () => null,
  firstQueryTabParams: jest.requireActual(
    "@/widgets/product-grid/model/popular-tabs",
  ).firstQueryTabParams,
}));
jest.mock("@/shared/api/banners-server", () => ({
  fetchPublishedBanners: jest.fn().mockResolvedValue({
    HERO_SLIDE: [],
    PROMO_TILE: [],
    PROMO_BANNER: [],
  }),
}));
jest.mock("@/shared/api/carousels-server", () => ({
  fetchPublishedCarouselsByPlacement: jest.fn(),
}));
jest.mock("@/shared/api/site-contact-server", () => ({
  fetchSiteContactSettings: jest.fn().mockResolvedValue(null),
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

import { fetchPublishedCarouselsByPlacement } from "@/shared/api/carousels-server";
import { ACTIVE_ROOT_CATEGORIES_PARAMS } from "@/entities/category";
import { SITE_URL } from "@/shared/config";
import { findDehydratedQueryKeys } from "@/shared/test/element-tree";
import { firstQueryTabParams } from "@/widgets/product-grid/model/popular-tabs";
import HomePage, { generateMetadata, revalidate } from "./page";

const fetchCarousels =
  fetchPublishedCarouselsByPlacement as jest.MockedFunction<
    typeof fetchPublishedCarouselsByPlacement
  >;

afterEach(() => jest.clearAllMocks());

describe("home page metadata (TASK-549)", () => {
  it("declares itself canonical, so ?utm_… variants consolidate onto /", async () => {
    const meta = await generateMetadata();

    expect(meta.alternates?.canonical).toBe(SITE_URL);
    expect(meta.openGraph?.url).toBe(SITE_URL);
  });
});

describe("home page — the first HTML carries links (TASK-563)", () => {
  it("prefetches the root categories and, with no HOME_TABS carousel, the rail's first tab", async () => {
    fetchCarousels.mockResolvedValue({ HOME_TABS: [], HOME_RAILS: [] });

    const tree = await HomePage();

    expect(findDehydratedQueryKeys(tree)).toEqual([
      ["/api/categories", ACTIVE_ROOT_CATEGORIES_PARAMS],
      ["/api/products", firstQueryTabParams([])],
    ]);
  });

  it("skips the rail when a HOME_TABS carousel already brings its products", async () => {
    fetchCarousels.mockResolvedValue({
      HOME_TABS: [
        {
          id: "c1",
          title: "Хіти",
          placement: "HOME_TABS",
          products: [{ id: "p1" }],
        },
      ],
      HOME_RAILS: [],
    } as never);

    const tree = await HomePage();

    expect(findDehydratedQueryKeys(tree)).toEqual([
      ["/api/categories", ACTIVE_ROOT_CATEGORIES_PARAMS],
    ]);
  });

  it("is prerendered with an hourly floor, so a copy baked without the API heals", () => {
    expect(revalidate).toBe(3600);
  });
});
