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
// React `cache()` memoizes only inside a server request, which Jest never opens —
// outside one it is a pass-through, so a "called once" assertion could not fail.
// Stand in for the request scope: one Map per wrapped function, emptied between
// tests exactly as a new request starts empty (TASK-703).
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

import { notFound, permanentRedirect } from "next/navigation";
import { catalogLandingControllerFindCompatPage } from "@/shared/api/generated/catalog/catalog";
import { categoryControllerGetCategoryTree } from "@/shared/api/generated/categories/categories";
import { resolveSlugRedirect } from "@/shared/lib/slug-redirect";
import { SITE_URL, dict } from "@/shared/config";
import { ProductListView } from "@/widgets";
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

afterEach(() => {
  jest.clearAllMocks();
  // A new test is a new request: forget every memoized call.
  (
    globalThis as { __requestMemos?: Map<string, unknown>[] }
  ).__requestMemos?.forEach((memo) => memo.clear());
});

describe("catalog/[category]/[device] — one API call per render (TASK-703)", () => {
  it("generateMetadata and the page body share a single compat-page request", async () => {
    findPage.mockResolvedValue(pair() as never);

    await meta("chohly", "iphone-15-pro");
    await run("chohly", "iphone-15-pro");

    expect(findPage).toHaveBeenCalledTimes(1);
  });

  it("does not share the answer between two different pairs", async () => {
    findPage.mockResolvedValue(pair() as never);

    await meta("chohly", "iphone-15-pro");
    await run("chohly", "iphone-15");

    expect(findPage).toHaveBeenCalledTimes(2);
  });
});

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

  /** Ledger stub: answers only the (entity, slug) pairs it is given. */
  function ledger(entries: Record<string, string>) {
    resolveRedirect.mockImplementation(
      async (entity, slug) => entries[`${entity}:${slug}`] ?? null,
    );
  }

  it("308s to the current category slug when the category was renamed", async () => {
    findPage.mockRejectedValue(notFoundError());
    ledger({ "CATEGORY:stari-chohly": "novi-chohly" });

    await expect(run("stari-chohly", "iphone-15-pro")).rejects.toThrow(
      "NEXT_REDIRECT:/catalog/novi-chohly/iphone-15-pro",
    );
    expect(resolveRedirect).toHaveBeenCalledWith("CATEGORY", "stari-chohly");
    expect(permanentRedirect).toHaveBeenCalledWith(
      "/catalog/novi-chohly/iphone-15-pro",
    );
    expect(notFound).not.toHaveBeenCalled();
  });

  // TASK-699: the model half of the same promise — a renamed DEVICE slug used to
  // leave the indexed `/catalog/<категорія>/<стара-модель>` as a dead 404.
  it("308s to the current model slug when the device model was renamed", async () => {
    findPage.mockRejectedValue(notFoundError());
    ledger({ "DEVICE_MODEL:iphone-15-pro-old": "iphone-15-pro" });

    await expect(run("chohly", "iphone-15-pro-old")).rejects.toThrow(
      "NEXT_REDIRECT:/catalog/chohly/iphone-15-pro",
    );
    expect(resolveRedirect).toHaveBeenCalledWith(
      "DEVICE_MODEL",
      "iphone-15-pro-old",
    );
    expect(permanentRedirect).toHaveBeenCalledWith(
      "/catalog/chohly/iphone-15-pro",
    );
    expect(notFound).not.toHaveBeenCalled();
  });

  it("308s in ONE hop when both the category and the model were renamed", async () => {
    // Two sequential redirects would cost the crawler a hop and pass through an
    // address that is itself dead — both segments are resolved before redirecting.
    findPage.mockRejectedValue(notFoundError());
    ledger({
      "CATEGORY:stari-chohly": "novi-chohly",
      "DEVICE_MODEL:iphone-15-pro-old": "iphone-15-pro",
    });

    await expect(run("stari-chohly", "iphone-15-pro-old")).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    // Exact-match: `toThrow(string)` is a substring test, and the half-fixed
    // «/catalog/novi-chohly/iphone-15-pro-old» would satisfy it.
    expect(permanentRedirect).toHaveBeenCalledTimes(1);
    expect(permanentRedirect).toHaveBeenCalledWith(
      "/catalog/novi-chohly/iphone-15-pro",
    );
  });

  it("404s when neither segment has a ledger entry", async () => {
    findPage.mockRejectedValue(notFoundError());
    ledger({});

    await expect(run("chohly", "nope")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(resolveRedirect).toHaveBeenCalledWith("CATEGORY", "chohly");
    expect(resolveRedirect).toHaveBeenCalledWith("DEVICE_MODEL", "nope");
    expect(permanentRedirect).not.toHaveBeenCalled();
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

/** Depth-first search of a rendered element tree for the first element of `type`. */
function findElement(
  node: unknown,
  type: unknown,
): { props: Record<string, unknown> } | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElement(child, type);
      if (hit) return hit;
    }
    return null;
  }
  const element = node as { type?: unknown; props?: Record<string, unknown> };
  if (element.type === type && element.props) {
    return { props: element.props };
  }
  return findElement(element.props?.children, type);
}

describe("catalog/[category]/[device] — boolean facets reach the grid (TASK-513)", () => {
  it("passes inStock/onSale=true from the URL into the grid's initial params", async () => {
    findPage.mockResolvedValue(pair() as never);

    const tree = await run("chohly", "iphone-15-pro", {
      inStock: "true",
      onSale: "true",
    });

    const grid = findElement(tree, ProductListView);
    expect(grid?.props.initialParams).toEqual(
      expect.objectContaining({ inStock: true, onSale: true }),
    );
  });

  it('treats "false" as no filter, like the metadata does', async () => {
    findPage.mockResolvedValue(pair() as never);

    const tree = await run("chohly", "iphone-15-pro", { inStock: "false" });

    const grid = findElement(tree, ProductListView);
    expect(grid?.props.initialParams).toEqual(
      expect.objectContaining({ inStock: undefined, onSale: undefined }),
    );
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
          metaTitle: "Чохли для iPhone 15 Pro — CaseStore",
          metaDescription: "Понад 40 моделей у наявності.",
        },
      }) as never,
    );

    const result = await meta("chohly", "iphone-15-pro");

    // An admin-typed title is used verbatim (titleAbsolute), not re-branded.
    expect(result.title).toEqual({
      absolute: "Чохли для iPhone 15 Pro — CaseStore",
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

  // TASK-568/569 — the category's own tile picture, with an alt, before the
  // store-wide card; one tree read shared with the body's breadcrumb.
  it("previews with the category's image, carrying the page title as alt", async () => {
    findPage.mockResolvedValue(pair() as never);
    (categoryControllerGetCategoryTree as jest.Mock).mockResolvedValueOnce({
      data: [
        {
          id: "cat-1",
          slug: "chohly",
          name: "Чохли",
          image: "https://cdn.example.com/chohly.jpg",
          children: [],
        },
      ],
    });

    const result = await meta("chohly", "iphone-15-pro");

    const og = result.openGraph as { images?: unknown; title?: string };
    expect(og.images).toEqual([
      { url: "https://cdn.example.com/chohly.jpg", alt: og.title },
    ]);
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
