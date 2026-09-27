import { fetchPublishedPage, fetchPublishedPageAnyKind } from "./pages-server";

/**
 * Only a real 404 is "no such page" (TASK-793).
 *
 * The readers used to turn EVERY failure into `null`, and `/legal/[slug]` /
 * `/info/[slug]` turn `null` into `notFound()` — so a 502, a timeout or a
 * refused connection answered HTTP 404 on canonical URLs from the sitemap, the
 * signal that makes a crawler drop them. Now the outage throws, which Next
 * renders as a 5xx the crawler retries.
 */
const originalFetch = global.fetch;
const originalBudget = process.env.SERVER_FETCH_TIMEOUT_MS;

function respond(status: number, body: unknown = {}): jest.Mock {
  return jest.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

/** An API that accepts the connection and never answers (only the abort ends it). */
function silentApi(): jest.Mock {
  return jest.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal!.reason as Error),
        );
      }),
  );
}

afterEach(() => {
  global.fetch = originalFetch;
  if (originalBudget === undefined) delete process.env.SERVER_FETCH_TIMEOUT_MS;
  else process.env.SERVER_FETCH_TIMEOUT_MS = originalBudget;
});

describe.each([
  ["fetchPublishedPage", () => fetchPublishedPage("privacy-policy", "LEGAL")],
  [
    "fetchPublishedPageAnyKind",
    () => fetchPublishedPageAnyKind("privacy-policy"),
  ],
])("%s (TASK-793)", (_name, read) => {
  it("returns the page on 200", async () => {
    global.fetch = respond(200, { data: { slug: "privacy-policy" } });

    await expect(read()).resolves.toEqual({ slug: "privacy-policy" });
  });

  it("returns null on a 404 — the route's notFound()", async () => {
    global.fetch = respond(404, { statusCode: 404 });

    await expect(read()).resolves.toBeNull();
  });

  it.each([500, 502, 503])(
    "throws on a %i — an outage is a 5xx, not a 404",
    async (status) => {
      global.fetch = respond(status);

      await expect(read()).rejects.toThrow(String(status));
    },
  );

  it("throws on a refused connection", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("fetch failed"));

    await expect(read()).rejects.toThrow("fetch failed");
  });

  it("throws when the API never answers (timeout)", async () => {
    process.env.SERVER_FETCH_TIMEOUT_MS = "20";
    global.fetch = silentApi();

    await expect(read()).rejects.toBeDefined();
  });
});
