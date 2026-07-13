import {
  fetchPublishedCarousels,
  fetchPublishedCarouselsByPlacement,
  CAROUSELS_COLLECTION_TAG,
} from "./carousels-server";

function carouselRow(
  id: string,
  title: string,
  products: unknown[] = [],
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    title,
    source: "BESTSELLING",
    placement: "HOME_RAILS",
    sortOrder: 0,
    products,
    ...extra,
  };
}

describe("fetchPublishedCarousels", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("returns the carousel list (empty products included) and tags the request", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          carouselRow("c1", "Хіти", [{ id: "p1" }]),
          // An empty carousel is the backend's honest answer — the helper does
          // NOT filter it; hiding it is the widget's job.
          carouselRow("c2", "Порожня"),
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const carousels = await fetchPublishedCarousels();

    expect(carousels.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(carousels[1].products).toHaveLength(0);

    // Tagged for on-demand revalidation via the shared `carousels` tag.
    const options = fetchMock.mock.calls[0][1];
    expect(options.next.tags).toContain(CAROUSELS_COLLECTION_TAG);
  });

  it("returns [] on a non-OK response", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({}) }) as never;

    await expect(fetchPublishedCarousels()).resolves.toEqual([]);
  });

  it("returns [] when the API is unreachable (never throws)", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED")) as never;

    await expect(fetchPublishedCarousels()).resolves.toEqual([]);
  });
});

describe("fetchPublishedCarouselsByPlacement (TASK-288)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function mockList(rows: unknown[]): jest.Mock {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: rows }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it("splits the single response into the two placement groups, preserving order", async () => {
    // The API returns the whole published list sorted by sortOrder; sortOrder is
    // scoped per placement, so each filtered subsequence is already ordered.
    const fetchMock = mockList([
      carouselRow("t1", "Хіти", [{ id: "p1" }], {
        placement: "HOME_TABS",
        sortOrder: 0,
      }),
      carouselRow("r1", "Рейл A", [{ id: "p2" }], {
        placement: "HOME_RAILS",
        sortOrder: 0,
      }),
      carouselRow("t2", "Новинки", [{ id: "p3" }], {
        placement: "HOME_TABS",
        sortOrder: 1,
      }),
      carouselRow("r2", "Рейл B", [], {
        placement: "HOME_RAILS",
        sortOrder: 1,
      }),
    ]);

    const groups = await fetchPublishedCarouselsByPlacement();

    expect(groups.HOME_TABS.map((c) => c.id)).toEqual(["t1", "t2"]);
    expect(groups.HOME_RAILS.map((c) => c.id)).toEqual(["r1", "r2"]);
    // One request for both groups (not one per placement).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].next.tags).toContain(
      CAROUSELS_COLLECTION_TAG,
    );
  });

  it("ignores an unknown placement instead of throwing", async () => {
    mockList([
      carouselRow("x", "Майбутнє", [{ id: "p1" }], { placement: "SIDEBAR" }),
    ]);

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
