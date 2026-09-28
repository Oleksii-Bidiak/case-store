import {
  ADDON_SERVICES_TAG,
  fetchActiveAddonServices,
} from "./addon-services-server";

/**
 * TASK-561 — `/info` lists the real add-on services. The reader must carry the
 * tag the API purges, and must never answer an outage with anything but an
 * empty list (a fallback list would be the invented prices this replaced).
 */
describe("fetchActiveAddonServices (TASK-561)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const services = [
    {
      id: "svc-a",
      name: "Гарантія +12 міс.",
      description: null,
      price: "499.00",
    },
  ];

  it("reads the public active list, tagged for on-demand purging", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: services }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(await fetchActiveAddonServices()).toEqual(services);

    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { next?: { tags?: string[]; revalidate?: number } },
    ];
    expect(url).toMatch(/\/api\/addon-services\/active$/);
    expect(init.next?.tags).toEqual([ADDON_SERVICES_TAG]);
    // Same rule as every tagged reader here (TASK-385): no timer beside the tag.
    expect(init.next?.revalidate).toBeUndefined();
  });

  it("pins the tag the API purges (store-api ADDON_SERVICES_TAG)", () => {
    expect(ADDON_SERVICES_TAG).toBe("addon-services");
  });

  it("answers a 5xx with an empty list, not a guess", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 502 }) as unknown as typeof fetch;

    expect(await fetchActiveAddonServices()).toEqual([]);
  });

  it("answers a refused connection with an empty list", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(
        new TypeError("fetch failed"),
      ) as unknown as typeof fetch;

    expect(await fetchActiveAddonServices()).toEqual([]);
  });
});
