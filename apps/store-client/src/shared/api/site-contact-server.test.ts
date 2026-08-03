import {
  fetchSiteContactSettings,
  SITE_CONTACT_TAG,
} from "./site-contact-server";

/**
 * Regression test for TASK-385 — this fetch must NOT carry a time-based
 * `revalidate`.
 *
 * The bug it locks down is one line with a blast radius nobody would guess from
 * reading it. `fetchSiteContactSettings` is called by `Footer`, `Footer` renders
 * in the ROOT LAYOUT, and Next.js gives a route the LOWEST `revalidate` among
 * every fetch on it. This was the only fetch in the storefront that set a time
 * at all — so `revalidate: 3600` here silently became the revalidation period of
 * all 24 prerendered routes.
 *
 * What that looked like in production: an admin changes the logo or a banner,
 * the API purges the right tag, and nothing happens for a while. Because ISR is
 * stale-while-revalidate the first visitor past the hour still gets the old
 * page and merely triggers the rebuild, and each route's clock starts whenever
 * that route last regenerated — so the delay is random per page, roughly 0–60
 * minutes. It was reported as "the feature does not work", and it hid a broken
 * revalidation pipeline for weeks precisely because the page did eventually
 * change.
 *
 * The tag is the mechanism. A timer beside it is a slow second path whose only
 * real effect is to disguise the fast one failing.
 */
describe("fetchSiteContactSettings — cache options (TASK-385)", () => {
  const originalFetch = global.fetch;

  function captureInit(): jest.Mock {
    return jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: null }),
    });
  }

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("tags the request so an admin write can purge it on demand", async () => {
    const fetchMock = captureInit();
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchSiteContactSettings();

    const init = fetchMock.mock.calls[0][1] as RequestInit & {
      next?: { tags?: string[] };
    };
    expect(init.next?.tags).toContain(SITE_CONTACT_TAG);
  });

  it("sets NO time-based revalidate — it would become every route's period", async () => {
    const fetchMock = captureInit();
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchSiteContactSettings();

    const init = fetchMock.mock.calls[0][1] as RequestInit & {
      next?: { revalidate?: number | false };
    };
    expect(init.next).not.toHaveProperty("revalidate");
  });

  it("still returns null rather than throwing when the API is unhappy", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;

    await expect(fetchSiteContactSettings()).resolves.toBeNull();
  });
});
