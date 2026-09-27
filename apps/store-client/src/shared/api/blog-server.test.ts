import { fetchPublishedPost } from "./blog-server";

/**
 * A blog post read tells "no such post" (404 → null → the route's notFound())
 * apart from "the API is down" (throw → 5xx) — TASK-793, the same rule as
 * `pages-server.ts`. Before it, a 502 on `/blog/<slug>` answered HTTP 404.
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

afterEach(() => {
  global.fetch = originalFetch;
  if (originalBudget === undefined) delete process.env.SERVER_FETCH_TIMEOUT_MS;
  else process.env.SERVER_FETCH_TIMEOUT_MS = originalBudget;
});

describe("fetchPublishedPost (TASK-793)", () => {
  it("returns the post on 200", async () => {
    global.fetch = respond(200, { data: { slug: "iphone16-vs-15" } });

    await expect(fetchPublishedPost("iphone16-vs-15")).resolves.toEqual({
      slug: "iphone16-vs-15",
    });
  });

  it("returns null on a 404", async () => {
    global.fetch = respond(404);

    await expect(fetchPublishedPost("never-existed")).resolves.toBeNull();
  });

  it("throws on a 502", async () => {
    global.fetch = respond(502);

    await expect(fetchPublishedPost("iphone16-vs-15")).rejects.toThrow("502");
  });

  it("throws when the API never answers (timeout)", async () => {
    process.env.SERVER_FETCH_TIMEOUT_MS = "20";
    global.fetch = jest.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal!.reason as Error),
          );
        }),
    );

    await expect(fetchPublishedPost("iphone16-vs-15")).rejects.toBeDefined();
  });
});
