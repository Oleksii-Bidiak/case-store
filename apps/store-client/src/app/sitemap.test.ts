jest.mock("@sentry/nextjs", () => ({ captureException: jest.fn() }));
jest.mock("@/shared/lib/schema", () => ({
  fetchAllActiveProducts: jest.fn(),
  fetchAllActiveCategories: jest.fn(),
  fetchAllPublishedPages: jest.fn(),
  fetchAllCompatLandingPages: jest.fn(),
}));
jest.mock("@/shared/api/blog-server", () => ({
  fetchPublishedPosts: jest.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import {
  fetchAllActiveProducts,
  fetchAllActiveCategories,
  fetchAllCompatLandingPages,
  fetchAllPublishedPages,
} from "@/shared/lib/schema";
import { fetchPublishedPosts } from "@/shared/api/blog-server";
import { INFO_SLUG_INLINED_ON_HUB, SITE_URL } from "@/shared/config";
import sitemap from "./sitemap";

const captureException = Sentry.captureException as jest.Mock;
const products = fetchAllActiveProducts as jest.Mock;
const categories = fetchAllActiveCategories as jest.Mock;
const pages = fetchAllPublishedPages as jest.Mock;
const posts = fetchPublishedPosts as jest.Mock;
const compat = fetchAllCompatLandingPages as jest.Mock;

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
    compat.mockResolvedValue([]);
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

  // TASK-435 — a page row's kind decides its address, and a HUB row has none.
  describe("page routes by kind", () => {
    it("puts LEGAL pages under /legal and INFO pages under /info", async () => {
      pages.mockResolvedValue([
        {
          slug: "privacy-policy",
          kind: "LEGAL",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
        {
          slug: "dostavka",
          kind: "INFO",
          updatedAt: "2026-06-02T00:00:00.000Z",
        },
      ]);

      const urls = (await sitemap()).map((route) => route.url);

      expect(urls).toContain(`${SITE_URL}/legal/privacy-policy`);
      expect(urls).toContain(`${SITE_URL}/info/dostavka`);
      // The help page must not ALSO appear under the legal prefix.
      expect(urls).not.toContain(`${SITE_URL}/legal/dostavka`);
    });

    it("emits nothing for the INFO page the hub renders inline", async () => {
      pages.mockResolvedValue([
        {
          slug: INFO_SLUG_INLINED_ON_HUB,
          kind: "INFO",
          updatedAt: "2026-06-02T00:00:00.000Z",
        },
      ]);

      const routes = await sitemap();
      const urls = routes.map((route) => route.url);

      // Its text is published on /info, which the static list already carries —
      // listing /info/<slug> too would put one body at two indexed URLs. The
      // route still exists and still canonicalizes to /info; it just does not
      // ask to be indexed separately.
      expect(urls).not.toContain(
        `${SITE_URL}/info/${INFO_SLUG_INLINED_ON_HUB}`,
      );
      expect(urls.filter((url) => url === `${SITE_URL}/info`)).toHaveLength(1);
      expect(routes).toHaveLength(STATIC_ROUTE_COUNT);
    });

    it("emits nothing for a HUB row — its route is already a static entry", async () => {
      pages.mockResolvedValue([
        { slug: "blog", kind: "HUB", updatedAt: "2026-06-01T00:00:00.000Z" },
      ]);

      const routes = await sitemap();
      const blogEntries = routes.filter(
        (route) => route.url === `${SITE_URL}/blog`,
      );

      // Exactly one /blog URL: the static one. A second would be a duplicate.
      expect(routes).toHaveLength(STATIC_ROUTE_COUNT);
      expect(blogEntries).toHaveLength(1);
      expect(routes.map((route) => route.url)).not.toContain(
        `${SITE_URL}/legal/blog`,
      );
    });
  });

  // TASK-490 — the compatibility landing pages `/catalog/<категорія>/<модель>`.
  describe("compatibility landing pages", () => {
    it("emits one entry per existing pair", async () => {
      compat.mockResolvedValue([
        { categorySlug: "chohly", deviceSlug: "iphone-15-pro" },
        { categorySlug: "chohly", deviceSlug: "galaxy-s24" },
      ]);

      const routes = await sitemap();

      expect(routes).toHaveLength(STATIC_ROUTE_COUNT + 2);
      expect(routes.map((route) => route.url)).toEqual(
        expect.arrayContaining([
          `${SITE_URL}/catalog/chohly/iphone-15-pro`,
          `${SITE_URL}/catalog/chohly/galaxy-s24`,
        ]),
      );
      expect(captureException).not.toHaveBeenCalled();
    });

    it("keeps the other sources when the pair source dies", async () => {
      compat.mockRejectedValue(new Error("API down"));
      categories.mockResolvedValue([
        { slug: "chohly", updatedAt: "2026-06-01T00:00:00.000Z" },
      ]);

      const routes = await sitemap();

      expect(routes.map((route) => route.url)).toContain(
        `${SITE_URL}/categories/chohly`,
      );
      expect(routes.some((route) => route.url.includes("/catalog/"))).toBe(
        false,
      );
      expect(captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: { route: "sitemap", source: "compat landing pages" },
        }),
      );
    });
  });

  it("reports every failing source (and still returns the static routes)", async () => {
    products.mockRejectedValue(new Error("boom"));
    categories.mockRejectedValue(new Error("boom"));
    pages.mockRejectedValue(new Error("boom"));
    posts.mockRejectedValue(new Error("boom"));
    compat.mockRejectedValue(new Error("boom"));

    const routes = await sitemap();

    expect(routes).toHaveLength(STATIC_ROUTE_COUNT);
    expect(captureException).toHaveBeenCalledTimes(5);
  });
});
