import {
  fetchSeoSettings,
  fetchSeoSettingsForChrome,
  SEO_SETTINGS_TAG,
  SeoSettingsUnavailableError,
} from "./seo-settings-server";

/**
 * Regression tests for TASK-327 — build-time fetches must be time-boxed.
 *
 * The failure mode these tests encode is NOT "the API refuses the connection"
 * (that already worked: the socket errors, `fetch` rejects, the `catch` returns
 * null). It is the *silent* API: a listener that ACCEPTS the TCP connection and
 * then never answers — the normal shape of a half-started container, a paused
 * VPS, or an API booting alongside the frontend in CI. Without a timeout the
 * request hangs until Next's own 60s static-generation budget expires, the page
 * is retried 3 times, and `next build` dies with
 * `Failed to build /<page> after 3 attempts`.
 *
 * `silentApi()` models exactly that: it only ever settles through the caller's
 * own `AbortSignal`. A caller that passes no signal hangs forever, so this test
 * FAILS (times out) against the un-fixed code — which is the point. A test that
 * cannot go red proves nothing.
 */
function silentApi(): jest.Mock {
  return jest.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          // Deliberately never settles: no timeout means no way out.
          return;
        }
        if (signal.aborted) {
          reject(signal.reason as Error);
          return;
        }
        signal.addEventListener("abort", () => reject(signal.reason as Error));
      }),
  );
}

describe("fetchSeoSettings — build-time timeout (TASK-327)", () => {
  const originalFetch = global.fetch;
  const originalBudget = process.env.SERVER_FETCH_TIMEOUT_MS;

  beforeEach(() => {
    // Small budget so the suite stays fast; the production default is 5000 ms.
    process.env.SERVER_FETCH_TIMEOUT_MS = "200";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalBudget === undefined) {
      delete process.env.SERVER_FETCH_TIMEOUT_MS;
    } else {
      process.env.SERVER_FETCH_TIMEOUT_MS = originalBudget;
    }
    jest.restoreAllMocks();
  });

  it("gives up on a silent API within the configured budget and returns null", async () => {
    const fetchMock = silentApi();
    global.fetch = fetchMock as unknown as typeof fetch;

    const startedAt = Date.now();
    const settings = await fetchSeoSettings();
    const elapsed = Date.now() - startedAt;

    expect(settings).toBeNull();
    // Generous ceiling — the assertion that matters is "bounded", not "200ms".
    expect(elapsed).toBeLessThan(2000);
  });

  it("passes an abort signal to fetch and keeps the ISR cache tag", async () => {
    const fetchMock = silentApi();
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchSeoSettings();

    const init = fetchMock.mock.calls[0][1] as RequestInit & {
      next?: { tags?: string[] };
    };
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(true);
    expect(init.next?.tags).toContain("seo-settings");
  });
});

/**
 * Regression tests for TASK-1988 — the storefront header/footer logo fell back
 * to the letter placeholder "C CaseStore" after unrelated admin writes.
 *
 * Two defects combined. The fetch carried only `next.tags`, which Next 16 does
 * NOT cache at runtime ("auto no cache"), so every page re-render — and a
 * `banners` purge re-renders every page, because the root layout reads that tag
 * — called `/api/seo-settings` again, through the one shared SSR rate-limit
 * bucket. And a 429 (or 5xx, or timeout) collapsed into `null`, which is
 * exactly what "no logo uploaded" looks like, so the placeholder HTML was the
 * page Next stored in the ISR cache.
 */
describe("fetchSeoSettings — durable cache and failure contract (TASK-1988)", () => {
  const originalFetch = global.fetch;
  const originalBudget = process.env.SERVER_FETCH_TIMEOUT_MS;

  /** The zero-config body the API answers with when nothing was ever saved. */
  const emptySettings = {
    id: "00000000-0000-0000-0000-000000000002",
    logoUrl: null,
    siteName: null,
    noindexSite: false,
    additionalSameAsLinks: [],
  };

  function respondWith(status: number, body: unknown = {}): jest.Mock {
    return jest.fn(async () => new Response(JSON.stringify(body), { status }));
  }

  beforeEach(() => {
    process.env.SERVER_FETCH_TIMEOUT_MS = "200";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalBudget === undefined) {
      delete process.env.SERVER_FETCH_TIMEOUT_MS;
    } else {
      process.env.SERVER_FETCH_TIMEOUT_MS = originalBudget;
    }
    jest.restoreAllMocks();
  });

  it("asks Next for a durable Data Cache entry under the seo-settings tag only", async () => {
    const fetchMock = respondWith(200, { data: emptySettings });
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchSeoSettings();

    const init = fetchMock.mock.calls[0][1] as RequestInit & {
      next?: { tags?: string[]; revalidate?: number | false };
    };
    expect(init.cache).toBe("force-cache");
    expect(init.next?.tags).toEqual([SEO_SETTINGS_TAG]);
    // No timer: a `revalidate` here would become the whole storefront's ISR
    // period (TASK-385). The tag purge is the only refresh path.
    expect(init.next?.revalidate).toBeUndefined();
  });

  it("the layout read shares the same cached request", async () => {
    const fetchMock = respondWith(200, { data: emptySettings });
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchSeoSettingsForChrome("phase-production-server");

    const init = fetchMock.mock.calls[0][1] as RequestInit & {
      next?: { tags?: string[] };
    };
    expect(init.cache).toBe("force-cache");
    expect(init.next?.tags).toEqual([SEO_SETTINGS_TAG]);
  });

  it("resolves the saved-nothing settings (logoUrl null) on a 200", async () => {
    global.fetch = respondWith(200, {
      data: emptySettings,
    }) as unknown as typeof fetch;

    await expect(
      fetchSeoSettingsForChrome("phase-production-server"),
    ).resolves.toEqual(emptySettings);
  });

  it.each([429, 500, 503])(
    "rejects a %i at runtime instead of resolving it as 'no logo'",
    async (status) => {
      global.fetch = respondWith(status) as unknown as typeof fetch;

      await expect(
        fetchSeoSettingsForChrome("phase-production-server"),
      ).rejects.toBeInstanceOf(SeoSettingsUnavailableError);
    },
  );

  it("rejects a timed-out read at runtime", async () => {
    global.fetch = silentApi() as unknown as typeof fetch;

    await expect(
      fetchSeoSettingsForChrome("phase-production-server"),
    ).rejects.toBeInstanceOf(SeoSettingsUnavailableError);
  });

  it("rejects a network failure at runtime", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    await expect(fetchSeoSettingsForChrome(undefined)).rejects.toBeInstanceOf(
      SeoSettingsUnavailableError,
    );
  });

  it("degrades to null only while `next build` prerenders (TASK-327)", async () => {
    global.fetch = respondWith(429) as unknown as typeof fetch;

    await expect(
      fetchSeoSettingsForChrome("phase-production-build"),
    ).resolves.toBeNull();
  });

  it("keeps the degrading contract for SEO surfaces (robots, feeds, page metadata)", async () => {
    global.fetch = respondWith(429) as unknown as typeof fetch;

    await expect(fetchSeoSettings()).resolves.toBeNull();
  });
});
