import {
  fetchPublishedCarousels,
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
