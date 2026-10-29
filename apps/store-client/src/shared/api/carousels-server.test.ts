import {
  fetchHomeBlocks,
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

describe("fetchHomeBlocks (TASK-660 / TASK-663)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("reads /api/home-blocks tagged with home-blocks AND carousels", async () => {
    const fetchMock = mockBlocks([block("HERO")]);

    const blocks = await fetchHomeBlocks();

    expect(blocks?.map((b) => b.type)).toEqual(["HERO"]);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/home-blocks$/);
    const options = fetchMock.mock.calls[0][1];
    expect(options.next.tags).toEqual(
      expect.arrayContaining([HOME_BLOCKS_TAG, CAROUSELS_COLLECTION_TAG]),
    );
  });

  it("returns the blocks as sent — order, several TABS / CAROUSEL blocks and empty carousels intact — in ONE request", async () => {
    const rows = [
      block("HERO"),
      block("TABS", {
        title: "Популярне",
        tabs: [
          carousel("t1", "Хіти", [{ id: "p1" }]),
          carousel("t2", "Новинки"),
        ],
      }),
      block("CAROUSEL", { carousel: carousel("r1", "Рейл A", [{ id: "p2" }]) }),
      block("TABS", { title: "Аксесуари", tabs: [carousel("t3", "Чохли")] }),
      block("CAROUSEL", { carousel: carousel("r2", "Рейл B") }),
      block("NEWSLETTER"),
    ];
    const fetchMock = mockBlocks(rows);

    const blocks = await fetchHomeBlocks();

    // Hiding an empty carousel is the widget's job (plan 154), not the fetcher's.
    expect(blocks).toEqual(rows);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("under a preview token sends the token, no-store and NO ISR tag (TASK-669)", async () => {
    const fetchMock = mockBlocks([]);

    await fetchHomeBlocks("signed-token");

    const options = fetchMock.mock.calls[0][1];
    expect(options.cache).toBe("no-store");
    expect(options).not.toHaveProperty("next");
    expect(options.headers).toEqual({ "x-preview-token": "signed-token" });
  });

  it("without a token sends no preview header and no cache override", async () => {
    const fetchMock = mockBlocks([]);

    await fetchHomeBlocks(null);

    const options = fetchMock.mock.calls[0][1];
    expect(options).not.toHaveProperty("cache");
    expect(options).not.toHaveProperty("headers");
    expect(options.next.tags).toEqual([
      HOME_BLOCKS_TAG,
      CAROUSELS_COLLECTION_TAG,
    ]);
  });

  it("returns [] for a genuine empty list", async () => {
    mockBlocks([]);

    await expect(fetchHomeBlocks()).resolves.toEqual([]);
  });

  it("returns null when the body carries no data", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) }) as never;

    await expect(fetchHomeBlocks()).resolves.toBeNull();
  });

  it("returns null on a non-OK response", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({}) }) as never;

    await expect(fetchHomeBlocks()).resolves.toBeNull();
  });

  it("returns null when the API is unreachable (never throws)", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED")) as never;

    await expect(fetchHomeBlocks()).resolves.toBeNull();
  });
});
