// The route imports the widgets barrel (ProductListView — a heavy client tree);
// none of these tests render it, so stub the barrel (same idiom as
// categories/[slug]/page.test.ts).
jest.mock("@/widgets", () => ({
  ProductListView: () => null,
  ProductListSkeleton: () => null,
}));
jest.mock("@/shared/api/generated/catalog/catalog", () => ({
  catalogLandingControllerFindCompatPage: jest.fn(),
}));
jest.mock("@/shared/api/generated/categories/categories", () => ({
  categoryControllerGetCategoryTree: jest.fn().mockResolvedValue({ data: [] }),
}));
// First product page fetched server-side for the ItemList JSON-LD.
jest.mock("@/shared/api/generated/products/products", () => ({
  productControllerFindAll: jest.fn().mockResolvedValue({ data: [] }),
}));
jest.mock("@/shared/api/seo-settings-server", () => ({
  fetchSeoSettings: jest.fn().mockResolvedValue(null),
}));
// Next's notFound()/permanentRedirect() throw special signals; mock them with
// throwing jest.fn()s so the tests can assert which one fired.
jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
jest.mock("@/shared/lib/slug-redirect", () => ({
  resolveSlugRedirect: jest.fn(),
}));

import { notFound, permanentRedirect } from "next/navigation";
import { catalogLandingControllerFindCompatPage } from "@/shared/api/generated/catalog/catalog";
import { resolveSlugRedirect } from "@/shared/lib/slug-redirect";
import { SITE_URL, dict } from "@/shared/config";
import CompatLandingPage, { generateMetadata } from "./page";

const findPage = catalogLandingControllerFindCompatPage as jest.MockedFunction<
  typeof catalogLandingControllerFindCompatPage
>;
const resolveRedirect = resolveSlugRedirect as jest.MockedFunction<
  typeof resolveSlugRedirect
>;

/** The API's own 404 — an axios-shaped rejection, which is what the route reads. */
function notFoundError(): unknown {
  return { response: { status: 404 } };
}

function pair(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      categoryId: "cat-1",
      categorySlug: "chohly",
      categoryName: "Чохли",
      productCount: 12,
      deviceModel: {
        id: "dev-1",
        deviceBrandId: "brand-1",
        name: "iPhone 15 Pro",
        slug: "iphone-15-pro",
        series: null,
        releaseYear: null,
        isActive: true,
        metaTitle: null,
        metaDescription: null,
        description: null,
      },
      ...overrides,
    },
  };
}

const run = (
  category: string,
  device: string,
  searchParams: Record<string, string> = {},
) =>
  CompatLandingPage({
    params: Promise.resolve({ category, device }),
    searchParams: Promise.resolve(searchParams),
  });

const meta = (
  category: string,
  device: string,
  searchParams: Record<string, string> = {},
) =>
  generateMetadata({
    params: Promise.resolve({ category, device }),
    searchParams: Promise.resolve(searchParams),
  });

afterEach(() => jest.clearAllMocks());

describe("catalog/[category]/[device] — existence (TASK-490)", () => {
  it("renders a pair that has products", async () => {
    findPage.mockResolvedValue(pair() as never);

    await expect(run("chohly", "iphone-15-pro")).resolves.toBeDefined();

    expect(findPage).toHaveBeenCalledWith("chohly", "iphone-15-pro");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("404s a pair with no products — never an empty landing page", async () => {
    // The API's 404 IS the "this page does not exist" verdict; rendering an
    // empty grid under an «… для iPhone 15 Pro» heading would be a thin page
    // the crawler learns to distrust.
    findPage.mockRejectedValue(notFoundError());
    resolveRedirect.mockResolvedValue(null);

    await expect(run("chohly", "iphone-15-pro")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });

  it("308s to the current category slug when the category was renamed", async () => {
    findPage.mockRejectedValue(notFoundError());
    resolveRedirect.mockResolvedValue("novi-chohly");

    await expect(run("stari-chohly", "iphone-15-pro")).rejects.toThrow(
      "NEXT_REDIRECT:/catalog/novi-chohly/iphone-15-pro",
    );
    expect(resolveRedirect).toHaveBeenCalledWith("CATEGORY", "stari-chohly");
    expect(permanentRedirect).toHaveBeenCalledWith(
      "/catalog/novi-chohly/iphone-15-pro",
    );
    expect(notFound).not.toHaveBeenCalled();
  });

  it("never consults the redirect ledger when the pair resolves", async () => {
    findPage.mockResolvedValue(pair() as never);

    await run("chohly", "iphone-15-pro");

    expect(resolveRedirect).not.toHaveBeenCalled();
  });

  it("rethrows a non-404 failure instead of 404ing the whole /catalog tree", async () => {
    // An API outage must surface as an error, not as a wall of 404s that
    // de-indexes every compat page at once.
    findPage.mockRejectedValue({ response: { status: 500 } });

    await expect(run("chohly", "iphone-15-pro")).rejects.not.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("catalog/[category]/[device] — metadata (TASK-490)", () => {
  it("builds title and description from the template, self-canonical", async () => {
    findPage.mockResolvedValue(pair() as never);

    const result = await meta("chohly", "iphone-15-pro");

    expect(result.title).toEqual({
      absolute: expect.stringContaining("Чохли для iPhone 15 Pro"),
    });
    expect(result.description).toBe(
      dict.meta.compatDescription("Чохли", "iPhone 15 Pro"),
    );
    expect(result.alternates?.canonical).toBe(
      `${SITE_URL}/catalog/chohly/iphone-15-pro`,
    );
    // Indexable: the unfiltered compat page is the one facet combination with
    // an address of its own.
    expect(result.robots).toBeUndefined();
  });

  it("lets the device model's admin overrides win over the template", async () => {
    findPage.mockResolvedValue(
      pair({
        deviceModel: {
          ...pair().data.deviceModel,
          metaTitle: "Чохли для iPhone 15 Pro — MobileStore",
          metaDescription: "Понад 40 моделей у наявності.",
        },
      }) as never,
    );

    const result = await meta("chohly", "iphone-15-pro");

    // An admin-typed title is used verbatim (titleAbsolute), not re-branded.
    expect(result.title).toEqual({
      absolute: "Чохли для iPhone 15 Pro — MobileStore",
    });
    expect(result.description).toBe("Понад 40 моделей у наявності.");
  });

  it("noindexes a faceted view and points its canonical at the category", async () => {
    findPage.mockResolvedValue(pair() as never);

    const result = await meta("chohly", "iphone-15-pro", {
      specs: "material:Силікон",
    });

    expect(result.robots).toEqual({ index: false, follow: true });
    expect(result.alternates?.canonical).toBe(`${SITE_URL}/categories/chohly`);
  });

  it("falls back to a bare title when there is no such page", async () => {
    findPage.mockRejectedValue(notFoundError());

    // A 404 route still needs *a* metadata object; the page body's notFound()
    // is what owns the status (this route has no loading.tsx).
    await expect(meta("chohly", "nope")).resolves.toEqual({
      title: dict.meta.compatFallbackTitle,
    });
  });
});
