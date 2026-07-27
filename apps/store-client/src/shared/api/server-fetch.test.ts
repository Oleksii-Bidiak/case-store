import {
  serverFetch,
  resolveServerFetchTimeoutMs,
  DEFAULT_SERVER_FETCH_TIMEOUT_MS,
} from "./server-fetch";

/**
 * Unit tests for the shared time-boxed server fetcher (TASK-327).
 *
 * `silentApi()` is the whole point: it models an API that ACCEPTS the connection
 * and then never answers, and it can only ever settle through the caller's own
 * signal. Anything that forgets the deadline hangs here instead of passing.
 */
function silentApi(): jest.Mock {
  return jest.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        if (signal.aborted) {
          reject(signal.reason as Error);
          return;
        }
        signal.addEventListener("abort", () => reject(signal.reason as Error));
      }),
  );
}

describe("resolveServerFetchTimeoutMs", () => {
  const originalBudget = process.env.SERVER_FETCH_TIMEOUT_MS;

  afterEach(() => {
    if (originalBudget === undefined) {
      delete process.env.SERVER_FETCH_TIMEOUT_MS;
    } else {
      process.env.SERVER_FETCH_TIMEOUT_MS = originalBudget;
    }
  });

  it("falls back to the built-in default when nothing is configured", () => {
    delete process.env.SERVER_FETCH_TIMEOUT_MS;
    expect(resolveServerFetchTimeoutMs()).toBe(DEFAULT_SERVER_FETCH_TIMEOUT_MS);
  });

  it("prefers an explicit per-call budget over the env var", () => {
    process.env.SERVER_FETCH_TIMEOUT_MS = "7000";
    expect(resolveServerFetchTimeoutMs(3000)).toBe(3000);
  });

  it("reads the env var when no explicit budget is given", () => {
    process.env.SERVER_FETCH_TIMEOUT_MS = "1500";
    expect(resolveServerFetchTimeoutMs()).toBe(1500);
  });

  it.each(["", "abc", "0", "-1", "NaN"])(
    "ignores the unusable env value %p and keeps the default",
    (value) => {
      process.env.SERVER_FETCH_TIMEOUT_MS = value;
      // A typo must never silently restore unbounded requests.
      expect(resolveServerFetchTimeoutMs()).toBe(
        DEFAULT_SERVER_FETCH_TIMEOUT_MS,
      );
    },
  );
});

describe("serverFetch", () => {
  const originalFetch = global.fetch;
  const originalBudget = process.env.SERVER_FETCH_TIMEOUT_MS;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalBudget === undefined) {
      delete process.env.SERVER_FETCH_TIMEOUT_MS;
    } else {
      process.env.SERVER_FETCH_TIMEOUT_MS = originalBudget;
    }
    jest.restoreAllMocks();
  });

  it("aborts a silent API once the budget expires", async () => {
    const fetchMock = silentApi();
    global.fetch = fetchMock as unknown as typeof fetch;

    const startedAt = Date.now();
    await expect(
      serverFetch("http://api.test/anything", { timeoutMs: 150 }),
    ).rejects.toMatchObject({ name: "TimeoutError" });

    expect(Date.now() - startedAt).toBeLessThan(2000);
  });

  it("passes cache directives and request options through untouched", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    await serverFetch("http://api.test/thing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      next: { tags: ["thing"], revalidate: 3600 },
      timeoutMs: 1000,
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit & {
      next?: { tags?: string[]; revalidate?: number };
      timeoutMs?: number;
    };
    expect(init.method).toBe("POST");
    expect(init.body).toBe("{}");
    expect(init.next).toEqual({ tags: ["thing"], revalidate: 3600 });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    // `timeoutMs` is ours, not a RequestInit field — it must not reach fetch.
    expect(init.timeoutMs).toBeUndefined();
  });

  it("still honours a caller-supplied signal (combined, not replaced)", async () => {
    const fetchMock = silentApi();
    global.fetch = fetchMock as unknown as typeof fetch;

    const controller = new AbortController();
    // Budget far beyond the test: only the caller's abort can end this.
    const pending = serverFetch("http://api.test/slow", {
      signal: controller.signal,
      timeoutMs: 60_000,
    });
    controller.abort(new Error("caller went away"));

    await expect(pending).rejects.toThrow("caller went away");
  });

  it("uses the env-configured budget when no explicit one is passed", async () => {
    process.env.SERVER_FETCH_TIMEOUT_MS = "120";
    const fetchMock = silentApi();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(serverFetch("http://api.test/default")).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });
});
