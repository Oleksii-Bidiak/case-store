// TASK-874 — `[slug]/layout.tsx` settles a dead or renamed slug ABOVE the
// route's `loading.tsx`, so the 404 / 308 reaches the wire before the skeleton
// shell streams with a 200. These tests pin who gets checked and that the
// layout and the page share one product read.
jest.mock("next/headers", () => ({ headers: jest.fn() }));
jest.mock("next/navigation", () => ({
  permanentRedirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
jest.mock("@/shared/api/generated/products/products", () => ({
  productControllerFindBySlug: jest.fn(),
}));
jest.mock("@/shared/lib/slug-redirect", () => ({
  resolveSlugRedirect: jest.fn(),
}));
// React `cache()` memoizes only inside a server request, which Jest never opens.
// Stand in for the request scope, emptied between tests (as in page.test.ts).
jest.mock("react", () => {
  const actual = jest.requireActual("react");
  const scope = globalThis as { __requestMemos?: Map<string, unknown>[] };
  scope.__requestMemos ??= [];
  return {
    ...actual,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      const memo = new Map<string, R>();
      scope.__requestMemos!.push(memo as Map<string, unknown>);
      return (...args: A): R => {
        const key = JSON.stringify(args);
        if (!memo.has(key)) memo.set(key, fn(...args));
        return memo.get(key)!;
      };
    },
  };
});

import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { productControllerFindBySlug } from "@/shared/api/generated/products/products";
import { resolveSlugRedirect } from "@/shared/lib/slug-redirect";
import ProductSlugLayout from "./layout";
import { resolveProductRoute } from "./product-route";

const headersMock = headers as jest.MockedFunction<typeof headers>;
const findBySlug = productControllerFindBySlug as jest.MockedFunction<
  typeof productControllerFindBySlug
>;
const resolveRedirect = resolveSlugRedirect as jest.MockedFunction<
  typeof resolveSlugRedirect
>;

const apiNotFound = () =>
  Object.assign(new Error("404"), { response: { status: 404 } });

/** Run the layout as a request carrying `requestHeaders` would. */
function runLayout(slug: string, requestHeaders: Record<string, string> = {}) {
  headersMock.mockResolvedValue(new Headers(requestHeaders) as never);
  return ProductSlugLayout({
    children: "page",
    params: Promise.resolve({ slug }),
  });
}

afterEach(() => {
  jest.clearAllMocks();
  (
    globalThis as { __requestMemos?: Map<string, unknown>[] }
  ).__requestMemos?.forEach((memo) => memo.clear());
});

describe("products/[slug] layout — the status reaches the wire (TASK-874)", () => {
  it.each([
    ["a crawler or curl (no Sec-Fetch-Dest)", {}],
    ["a browser document load", { "sec-fetch-dest": "document" }],
  ])("serves notFound() for a dead slug to %s", async (_label, request) => {
    findBySlug.mockRejectedValue(apiNotFound());
    resolveRedirect.mockResolvedValue(null);

    await expect(runLayout("never-existed", request)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    // The ledger is consulted first — a rename must win over a 404.
    expect(resolveRedirect).toHaveBeenCalledWith("PRODUCT", "never-existed");
  });

  it("permanently redirects a renamed slug before the skeleton streams", async () => {
    findBySlug.mockRejectedValue(apiNotFound());
    resolveRedirect.mockResolvedValue("novyi-slug");

    await expect(runLayout("staryi-slug")).rejects.toThrow(
      "NEXT_REDIRECT:/products/novyi-slug",
    );
    expect(notFound).not.toHaveBeenCalled();
  });

  it("leaves the client router's own requests to the page — no read per prefetched card", async () => {
    await expect(
      runLayout("any-card", { "sec-fetch-dest": "empty" }),
    ).resolves.toBe("page");

    expect(findBySlug).not.toHaveBeenCalled();
    expect(resolveRedirect).not.toHaveBeenCalled();
  });

  it("renders a live product and hands the page the same read", async () => {
    findBySlug.mockResolvedValue({ data: { slug: "chohol" } } as never);

    await expect(runLayout("chohol")).resolves.toBe("page");
    // What the page does next — one request scope, one axios read.
    await resolveProductRoute("chohol");

    expect(findBySlug).toHaveBeenCalledTimes(1);
    expect(resolveRedirect).not.toHaveBeenCalled();
    expect(permanentRedirect).not.toHaveBeenCalled();
  });

  it("does not call an outage a missing product — a 502 renders the page", async () => {
    findBySlug.mockRejectedValue(
      Object.assign(new Error("502"), { response: { status: 502 } }),
    );
    resolveRedirect.mockResolvedValue(null);

    await expect(runLayout("chohol")).resolves.toBe("page");
    expect(notFound).not.toHaveBeenCalled();
  });
});
