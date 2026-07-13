jest.mock("@sentry/nextjs", () => ({ captureException: jest.fn() }));
jest.mock("@/shared/lib/schema", () => ({
  fetchAllActiveProducts: jest.fn(),
  fetchAllActiveCategories: jest.fn(),
  fetchAllPublishedPages: jest.fn(),
}));
jest.mock("@/shared/api/blog-server", () => ({
  fetchPublishedPosts: jest.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import {
  fetchAllActiveProducts,
  fetchAllActiveCategories,
  fetchAllPublishedPages,
} from "@/shared/lib/schema";
import { fetchPublishedPosts } from "@/shared/api/blog-server";
import { SITE_URL } from "@/shared/config";
import sitemap from "./sitemap";

const captureException = Sentry.captureException as jest.Mock;
const products = fetchAllActiveProducts as jest.Mock;
const categories = fetchAllActiveCategories as jest.Mock;
const pages = fetchAllPublishedPages as jest.Mock;
const posts = fetchPublishedPosts as jest.Mock;

const STATIC_ROUTE_COUNT = 8;

describe("sitemap", () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    products.mockResolvedValue([]);
    categories.mockResolvedValue([]);
    pages.mockResolvedValue([]);
    posts.mockResolvedValue({ posts: [] });
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("lists the dynamic routes next to the static ones", async () => {
    products.mockResolvedValue([
      { slug: "case-alpha", updatedAt: "2026-06-01T00:00:00.000Z" },
    ]);

    const routes = await sitemap();

    expect(routes).toHaveLength(STATIC_ROUTE_COUNT + 1);
    expect(routes.map((route) => route.url)).toContain(
      `${SITE_URL}/products/case-alpha`,
    );
    expect(captureException).not.toHaveBeenCalled();
  });

  it("keeps the other sources when one fails, and reports the failure to Sentry", async () => {
    products.mockRejectedValue(new Error("API down"));
    categories.mockResolvedValue([
      { slug: "cases", updatedAt: "2026-06-01T00:00:00.000Z" },
    ]);

    const routes = await sitemap();

    // The categories still ship — one dead source never drops the rest.
    expect(routes.map((route) => route.url)).toContain(
      `${SITE_URL}/categories/cases`,
    );
    expect(routes.some((route) => route.url.includes("/products/"))).toBe(
      false,
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "[sitemap] Failed to fetch products:",
      expect.any(Error),
    );
    // console.error alone never reaches Sentry from the Node runtime — a silently
    // emptied sitemap is exactly the failure that must page someone.
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: { route: "sitemap", source: "products" },
      }),
    );
  });

  it("reports every failing source (and still returns the static routes)", async () => {
    products.mockRejectedValue(new Error("boom"));
    categories.mockRejectedValue(new Error("boom"));
    pages.mockRejectedValue(new Error("boom"));
    posts.mockRejectedValue(new Error("boom"));

    const routes = await sitemap();

    expect(routes).toHaveLength(STATIC_ROUTE_COUNT);
    expect(captureException).toHaveBeenCalledTimes(4);
  });
});
