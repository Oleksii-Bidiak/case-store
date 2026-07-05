import {
  fetchPublishedBanners,
  BANNERS_COLLECTION_TAG,
} from "./banners-server";

function bannerRow(
  id: string,
  placement: string,
  title: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    placement,
    title,
    subtitle: null,
    imageUrl: null,
    imageBlurDataUrl: null,
    ctaLabel: null,
    ctaHref: null,
    theme: null,
    sortOrder: 0,
    status: "PUBLISHED",
    publishedAt: "2026-07-01T00:00:00.000Z",
    scheduledAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...extra,
  };
}

describe("fetchPublishedBanners", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("groups published banners by placement and tags the request", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          bannerRow("b1", "HERO_SLIDE", "Hero A"),
          bannerRow("b2", "HERO_SLIDE", "Hero B"),
          bannerRow("b3", "PROMO_TILE", "Tile A"),
          bannerRow("b4", "ANNOUNCEMENT_BAR", "News"),
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const groups = await fetchPublishedBanners();

    expect(groups.HERO_SLIDE.map((b) => b.title)).toEqual(["Hero A", "Hero B"]);
    expect(groups.PROMO_TILE).toHaveLength(1);
    expect(groups.PROMO_BANNER).toHaveLength(0);
    expect(groups.ANNOUNCEMENT_BAR).toHaveLength(1);

    // Tagged for on-demand revalidation via the shared `banners` tag.
    const options = fetchMock.mock.calls[0][1];
    expect(options.next.tags).toContain(BANNERS_COLLECTION_TAG);
  });

  it("returns all-empty groups on a non-OK response", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({}) }) as never;

    const groups = await fetchPublishedBanners();

    expect(groups.HERO_SLIDE).toHaveLength(0);
    expect(groups.PROMO_TILE).toHaveLength(0);
    expect(groups.PROMO_BANNER).toHaveLength(0);
    expect(groups.ANNOUNCEMENT_BAR).toHaveLength(0);
  });

  it("returns all-empty groups when the API is unreachable (never throws)", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED")) as never;

    await expect(fetchPublishedBanners()).resolves.toEqual({
      HERO_SLIDE: [],
      PROMO_TILE: [],
      PROMO_BANNER: [],
      ANNOUNCEMENT_BAR: [],
    });
  });
});
