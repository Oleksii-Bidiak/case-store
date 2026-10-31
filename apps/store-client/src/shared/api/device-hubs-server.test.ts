import {
  DEVICE_HUBS_TAG,
  DEVICE_HUB_REVALIDATE_SECONDS,
  fetchDeviceHub,
  fetchSeriesSiblings,
} from "./device-hubs-server";

function sibling(
  id: string,
  series: string | null,
  productCount: number,
  name = id,
) {
  return {
    id,
    deviceBrandId: "b1",
    name,
    slug: id,
    series,
    releaseYear: 2023,
    brandName: "Apple",
    brandSlug: "apple",
    productCount,
  };
}

describe("device-hubs-server", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function mockFetch(response: Partial<Response> & { json?: () => unknown }) {
    const fetchMock = jest.fn().mockResolvedValue(response);
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  describe("fetchDeviceHub", () => {
    it("reads the hub through a fetch tagged `device-hubs` (TASK-2101)", async () => {
      // The store-api purge reaches the page only through this exact tag.
      expect(DEVICE_HUBS_TAG).toBe("device-hubs");
      const hub = {
        model: { slug: "iphone-15-pro" },
        productCount: 3,
        groups: [],
      };
      const fetchMock = mockFetch({
        ok: true,
        status: 200,
        json: async () => ({ data: hub }),
      });

      await expect(fetchDeviceHub("iphone-15-pro")).resolves.toEqual(hub);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toMatch(/\/api\/catalog\/device-hubs\/iphone-15-pro$/);
      expect(init.next).toEqual({
        tags: ["device-hubs"],
        revalidate: DEVICE_HUB_REVALIDATE_SECONDS,
      });
    });

    it("answers null on a 404 — the page then 404s or redirects", async () => {
      mockFetch({ ok: false, status: 404 });
      await expect(fetchDeviceHub("nokia-3310")).resolves.toBeNull();
    });

    it("throws on an outage instead of passing for a missing hub", async () => {
      mockFetch({ ok: false, status: 502 });
      await expect(fetchDeviceHub("iphone-15-pro")).rejects.toThrow("502");
    });

    it("encodes the slug into the path", async () => {
      const fetchMock = mockFetch({ ok: false, status: 404 });
      await fetchDeviceHub("a/b");
      expect(fetchMock.mock.calls[0][0]).toMatch(/device-hubs\/a%2Fb$/);
    });
  });

  describe("fetchSeriesSiblings", () => {
    it("keeps exact series matches with products, excluding the model itself", async () => {
      const fetchMock = mockFetch({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            sibling("iphone-15-pro-max", "iPhone 15", 117),
            sibling("iphone-15-pro", "iPhone 15", 128),
            sibling("iphone-15-plus", "iPhone 15", 73),
            sibling("iphone-15-empty", "iPhone 15", 0),
            sibling("iphone-15e", "iPhone 15e", 9),
          ],
        }),
      });

      const result = await fetchSeriesSiblings({
        id: "iphone-15-pro",
        series: "iPhone 15",
      });

      expect(result.map((m) => m.id)).toEqual([
        "iphone-15-pro-max",
        "iphone-15-plus",
      ]);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain("search=iPhone+15");
      expect(url).toContain("sort=popular");
      expect(init.next.tags).toEqual(["device-hubs"]);
    });

    it("caps the list", async () => {
      mockFetch({
        ok: true,
        status: 200,
        json: async () => ({
          data: Array.from({ length: 9 }, (_, i) =>
            sibling(`m${i}`, "Galaxy S24", 5),
          ),
        }),
      });
      const result = await fetchSeriesSiblings(
        { id: "x", series: "Galaxy S24" },
        5,
      );
      expect(result).toHaveLength(5);
    });

    it("skips the request when the model has no series", async () => {
      const fetchMock = mockFetch({ ok: true, status: 200 });
      await expect(
        fetchSeriesSiblings({ id: "x", series: null }),
      ).resolves.toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("degrades to an empty list on any failure", async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error("down")) as unknown as typeof fetch;
      await expect(
        fetchSeriesSiblings({ id: "x", series: "iPhone 15" }),
      ).resolves.toEqual([]);
    });
  });
});
