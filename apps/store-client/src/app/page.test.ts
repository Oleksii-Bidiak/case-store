// The home page imports the widgets barrel (heavy client trees) and the server
// fetchers. The widgets are stubbed with NAMED stubs, so the element tree tells
// which section stands where; the rail's tab model is real, since it decides
// what the page prefetches (TASK-563). The homepage-blocks fetcher is REAL and
// talks to a stubbed `global.fetch`, so "API down" is exercised end to end.
jest.mock("@/widgets", () => {
  const stub = (name: string) =>
    Object.assign(() => null, { displayName: name });
  return {
    HeroBanner: stub("HeroBanner"),
    TrustStrip: stub("TrustStrip"),
    CategoryNav: stub("CategoryNav"),
    PopularRail: stub("PopularRail"),
    RecommendationCarousels: stub("RecommendationCarousels"),
    PromoBanner: stub("PromoBanner"),
    RecentlyViewed: stub("RecentlyViewed"),
    Newsletter: stub("Newsletter"),
    firstQueryTabParams: jest.requireActual(
      "@/widgets/product-grid/model/popular-tabs",
    ).firstQueryTabParams,
  };
});
jest.mock("@/shared/api/banners-server", () => ({
  fetchPublishedBanners: jest.fn().mockResolvedValue({
    HERO_SLIDE: [],
    PROMO_TILE: [],
    PROMO_BANNER: [],
  }),
}));
// The request APIs the signed preview reads (TASK-669) — see mockPreviewRequest.
jest.mock("next/headers", () => ({ draftMode: jest.fn(), cookies: jest.fn() }));
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

import { ACTIVE_ROOT_CATEGORIES_PARAMS } from "@/entities/category";
import { SITE_URL } from "@/shared/config";
import { findDehydratedQueryKeys } from "@/shared/test/element-tree";
import { firstQueryTabParams } from "@/widgets/product-grid/model/popular-tabs";
import { fetchPublishedBanners } from "@/shared/api/banners-server";
import { PREVIEW_ROBOTS } from "@/shared/api/preview-token";
import { mockPreviewRequest } from "@/shared/test/preview-request";
import HomePage, { generateMetadata, revalidate } from "./page";

beforeEach(() => mockPreviewRequest(null));

/** Today's hard-coded order — what the page falls back to (TASK-663). */
const DEFAULT_SECTIONS = [
  "HeroBanner",
  "TrustStrip",
  "CategoryNav",
  "PopularRail",
  "PromoBanner",
  "RecentlyViewed",
  "Newsletter",
];

interface Section {
  name: string;
  props: Record<string, unknown>;
}

/** The stubbed widget sections of the tree, in document order. */
function sections(node: unknown): Section[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(sections);
  const { type, props } = node as {
    type?: unknown;
    props?: Record<string, unknown>;
  };
  if (!props) return [];
  const name =
    typeof type === "function"
      ? (type as { displayName?: string }).displayName
      : undefined;
  const own = name ? [{ name, props }] : [];
  return [...own, ...sections(props.children)];
}

const names = (tree: unknown) => sections(tree).map((s) => s.name);

function carousel(id: string, title: string, products: unknown[] = []) {
  return {
    id,
    title,
    source: "BESTSELLING",
    status: "PUBLISHED",
    sortOrder: 0,
    products,
  };
}

let seq = 0;
function block(type: string, extra: Record<string, unknown> = {}) {
  seq += 1;
  return {
    id: `${type}-${seq}`,
    type,
    title: null,
    sortOrder: seq,
    status: "PUBLISHED",
    carousel: null,
    tabs: [],
    ...extra,
  };
}

const originalFetch = global.fetch;

/** `GET /api/home-blocks` answers with these rows. */
function mockBlocks(rows: unknown[]): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: rows }),
  }) as unknown as typeof fetch;
}

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

describe("home page metadata (TASK-549)", () => {
  it("declares itself canonical, so ?utm_… variants consolidate onto /", async () => {
    const meta = await generateMetadata();

    expect(meta.alternates?.canonical).toBe(SITE_URL);
    expect(meta.openGraph?.url).toBe(SITE_URL);
  });
});

describe("home page — sections follow the homepage blocks (TASK-663)", () => {
  it("renders one section per block, in the order the API sends them", async () => {
    mockBlocks([
      block("HERO"),
      block("TABS", {
        title: "Популярне",
        tabs: [carousel("t1", "Хіти", [{ id: "p1" }])],
      }),
      block("CAROUSEL", {
        carousel: carousel("r1", "Чохли", [{ id: "p2" }]),
      }),
      block("TRUST"),
      block("PROMO_BANNER"),
      block("CATEGORY_NAV"),
      block("NEWSLETTER"),
      block("RECENTLY_VIEWED"),
    ]);

    const tree = await HomePage();

    expect(names(tree)).toEqual([
      "HeroBanner",
      "PopularRail",
      "RecommendationCarousels",
      "TrustStrip",
      "PromoBanner",
      "CategoryNav",
      "Newsletter",
      "RecentlyViewed",
    ]);
  });

  it("leaves out a section whose block is not sent (hidden by the owner)", async () => {
    mockBlocks([block("HERO"), block("CATEGORY_NAV"), block("NEWSLETTER")]);

    const tree = await HomePage();

    expect(names(tree)).toEqual(["HeroBanner", "CategoryNav", "Newsletter"]);
  });

  it("renders two TABS blocks as two rails, each with its own title and tabs", async () => {
    const apple = [carousel("t1", "iPhone", [{ id: "p1" }])];
    const accessories = [
      carousel("t2", "Чохли", [{ id: "p2" }]),
      carousel("t3", "Зарядки", [{ id: "p3" }]),
    ];
    mockBlocks([
      block("TABS", { title: "Техніка Apple", tabs: apple }),
      block("TRUST"),
      block("TABS", { title: "Аксесуари", tabs: accessories }),
    ]);

    const rails = sections(await HomePage()).filter(
      (s) => s.name === "PopularRail",
    );

    expect(rails.map((r) => r.props.title)).toEqual([
      "Техніка Apple",
      "Аксесуари",
    ]);
    expect(rails[0].props.carousels).toEqual(apple);
    expect(rails[1].props.carousels).toEqual(accessories);
  });

  it("gives every CAROUSEL block its own rail with exactly that carousel", async () => {
    const first = carousel("r1", "Чохли", [{ id: "p1" }]);
    const second = carousel("r2", "Редакція обирає", [{ id: "p2" }]);
    mockBlocks([
      block("CAROUSEL", { carousel: first }),
      block("NEWSLETTER"),
      block("CAROUSEL", { carousel: second }),
    ]);

    const rails = sections(await HomePage()).filter(
      (s) => s.name === "RecommendationCarousels",
    );

    expect(rails.map((r) => r.props.carousels)).toEqual([[first], [second]]);
  });

  it("skips a CAROUSEL block that arrives without its carousel", async () => {
    mockBlocks([block("CAROUSEL", { carousel: null }), block("NEWSLETTER")]);

    expect(names(await HomePage())).toEqual(["Newsletter"]);
  });

  it("falls back to today's hard-coded order when the API returns no blocks", async () => {
    mockBlocks([]);

    const tree = await HomePage();

    expect(names(tree)).toEqual(DEFAULT_SECTIONS);
    const rail = sections(tree).find((s) => s.name === "PopularRail");
    // No tabs → PopularRail shows its query-driven «Популярне» tabs.
    expect(rail?.props.carousels).toEqual([]);
  });

  it("falls back to today's hard-coded order when the API is unreachable", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;

    expect(names(await HomePage())).toEqual(DEFAULT_SECTIONS);
  });

  it("falls back to today's hard-coded order on a non-OK response", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({}) }) as never;

    expect(names(await HomePage())).toEqual(DEFAULT_SECTIONS);
  });
});

describe("home page — the first HTML carries links (TASK-563)", () => {
  it("prefetches the root categories and, for a TABS block with no tabs, the rail's first tab", async () => {
    mockBlocks([block("TABS", { title: "Популярне", tabs: [] })]);

    const tree = await HomePage();

    expect(findDehydratedQueryKeys(tree)).toEqual([
      ["/api/categories", ACTIVE_ROOT_CATEGORIES_PARAMS],
      ["/api/products", firstQueryTabParams([])],
    ]);
  });

  it("prefetches the rail's first tab on the fallback page too", async () => {
    mockBlocks([]);

    expect(findDehydratedQueryKeys(await HomePage())).toEqual([
      ["/api/categories", ACTIVE_ROOT_CATEGORIES_PARAMS],
      ["/api/products", firstQueryTabParams([])],
    ]);
  });

  it("skips the rail when the TABS block's carousels already bring their products", async () => {
    mockBlocks([
      block("TABS", { tabs: [carousel("c1", "Хіти", [{ id: "p1" }])] }),
    ]);

    expect(findDehydratedQueryKeys(await HomePage())).toEqual([
      ["/api/categories", ACTIVE_ROOT_CATEGORIES_PARAMS],
    ]);
  });

  it("prefetches per block: one query for any number of tab-less TABS blocks, none for a resolved one", async () => {
    mockBlocks([
      block("TABS", { title: "Популярне", tabs: [] }),
      block("TABS", { title: "Аксесуари", tabs: [carousel("c1", "Чохли")] }),
      block("TABS", {
        title: "Техніка Apple",
        tabs: [carousel("c2", "iPhone", [{ id: "p1" }])],
      }),
    ]);

    // Blocks 1 and 2 both resolve to the fallback tabs (block 2's only tab is
    // empty) — the same query, so one entry; block 3 needs none.
    expect(findDehydratedQueryKeys(await HomePage())).toEqual([
      ["/api/categories", ACTIVE_ROOT_CATEGORIES_PARAMS],
      ["/api/products", firstQueryTabParams([])],
    ]);
  });

  it("prefetches no rail when the page has no TABS block", async () => {
    mockBlocks([block("HERO"), block("NEWSLETTER")]);

    expect(findDehydratedQueryKeys(await HomePage())).toEqual([
      ["/api/categories", ACTIVE_ROOT_CATEGORIES_PARAMS],
    ]);
  });

  it("is prerendered with an hourly floor, so a copy baked without the API heals", () => {
    expect(revalidate).toBe(3600);
  });
});

describe("home page — the signed preview (TASK-669)", () => {
  /** The `init` of the `GET /api/home-blocks` call. */
  const blocksInit = () =>
    (global.fetch as jest.Mock).mock.calls.find(([url]) =>
      String(url).endsWith("/api/home-blocks"),
    )![1];

  it("without draft mode stays the cached, indexable page: ISR tags, no token, no robots", async () => {
    mockBlocks([block("HERO")]);

    await HomePage();
    const meta = await generateMetadata();

    expect(blocksInit().next.tags).toEqual(["home-blocks", "carousels"]);
    expect(blocksInit()).not.toHaveProperty("headers");
    expect(blocksInit()).not.toHaveProperty("cache");
    expect(fetchPublishedBanners).toHaveBeenCalledWith(null);
    expect(meta).not.toHaveProperty("robots");
  });

  it("in a preview forwards the token, skips the cache, drops the ISR tags and is noindex", async () => {
    mockPreviewRequest("home-token");
    mockBlocks([block("HERO")]);

    await HomePage();
    const meta = await generateMetadata();

    expect(blocksInit()).not.toHaveProperty("next");
    expect(blocksInit().cache).toBe("no-store");
    expect(blocksInit().headers).toEqual({ "x-preview-token": "home-token" });
    expect(fetchPublishedBanners).toHaveBeenCalledWith("home-token");
    expect(meta.robots).toEqual(PREVIEW_ROBOTS);
    // Everything else about the page's metadata is unchanged.
    expect(meta.alternates?.canonical).toBe(SITE_URL);
  });

  it("renders the draft blocks the API sent for the token", async () => {
    mockPreviewRequest("home-token");
    mockBlocks([block("NEWSLETTER"), block("HERO")]);

    expect(names(await HomePage())).toEqual(["Newsletter", "HeroBanner"]);
  });
});
