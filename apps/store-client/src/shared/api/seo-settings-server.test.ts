import { fetchSeoSettings } from "./seo-settings-server";

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
