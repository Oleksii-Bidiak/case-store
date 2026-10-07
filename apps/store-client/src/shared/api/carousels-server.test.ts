import {
  fetchHomeBlocks,
  fetchPublishedCarouselsByPlacement,
  CAROUSELS_COLLECTION_TAG,
  HOME_BLOCKS_TAG,
} from "./carousels-server";

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

function block(type: string, extra: Record<string, unknown> = {}) {
  return {
    id: `${type}-${Math.random()}`,
    type,
    title: null,
    sortOrder: 0,
    status: "PUBLISHED",
    carousel: null,
    tabs: [],
    ...extra,
  };
}

function mockBlocks(rows: unknown[]): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: rows }),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("fetchHomeBlocks (TASK-660)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("reads /api/home-blocks tagged with home-blocks AND carousels", async () => {
    const fetchMock = mockBlocks([block("HERO")]);

    const blocks = await fetchHomeBlocks();

    expect(blocks.map((b) => b.type)).toEqual(["HERO"]);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/home-blocks$/);
    const options = fetchMock.mock.calls[0][1];
    expect(options.next.tags).toEqual(
      expect.arrayContaining([HOME_BLOCKS_TAG, CAROUSELS_COLLECTION_TAG]),
    );
  });

  it("returns [] on a non-OK response", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({}) }) as never;

    await expect(fetchHomeBlocks()).resolves.toEqual([]);
  });

  it("returns [] when the API is unreachable (never throws)", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED")) as never;

    await expect(fetchHomeBlocks()).resolves.toEqual([]);
  });
});

describe("fetchPublishedCarouselsByPlacement — derived from the blocks (TASK-660 bridge)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("takes the first TABS block's tabs and every CAROUSEL block's carousel, in block order", async () => {
    const fetchMock = mockBlocks([
      block("HERO"),
      block("TABS", {
        title: "Популярне",
        tabs: [
          carousel("t1", "Хіти", [{ id: "p1" }]),
          carousel("t2", "Новинки"),
        ],
      }),
      block("CAROUSEL", { carousel: carousel("r1", "Рейл A", [{ id: "p2" }]) }),
      // A second TABS block is TASK-663's to render; the bridge ignores it.
      block("TABS", { title: "Аксесуари", tabs: [carousel("t3", "Чохли")] }),
      block("CAROUSEL", { carousel: carousel("r2", "Рейл B") }),
      block("NEWSLETTER"),
    ]);

    const groups = await fetchPublishedCarouselsByPlacement();

    expect(groups.HOME_TABS.map((c) => c.id)).toEqual(["t1", "t2"]);
    expect(groups.HOME_RAILS.map((c) => c.id)).toEqual(["r1", "r2"]);
    // An empty carousel is the backend's honest answer — not filtered here.
    expect(groups.HOME_TABS[1].products).toHaveLength(0);
    // One request for the whole page.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives PopularRail an empty group (its fallback tabs) when the TABS block has no tabs", async () => {
    mockBlocks([block("TABS", { title: "Популярне", tabs: [] })]);

    await expect(fetchPublishedCarouselsByPlacement()).resolves.toEqual({
      HOME_TABS: [],
      HOME_RAILS: [],
    });
  });

  it("returns empty groups when the API is unreachable", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED")) as never;

    await expect(fetchPublishedCarouselsByPlacement()).resolves.toEqual({
      HOME_TABS: [],
      HOME_RAILS: [],
    });
  });
});
