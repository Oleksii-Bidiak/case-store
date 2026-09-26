// The route imports the widgets barrel (ProductListView — heavy client tree);
// the redirect tests never render it, so stub the barrel (same idiom as
// blog/[slug]/page.test.ts and products/[slug]/page.test.ts).
jest.mock("@/widgets", () => ({
  ProductListView: () => null,
  ProductListSkeleton: () => null,
  SubcategoryChips: () => null,
}));
// Category tree fetch used by resolveCategoryPath — an empty tree resolves the
// slug to null (the tree is active-only), which is the route's 404 candidate.
jest.mock("@/shared/api/generated/categories/categories", () => ({
  categoryControllerGetCategoryTree: jest.fn(),
}));
// The grid's page, prefetched server-side (TASK-563) — it feeds both the
// HydrationBoundary and the ItemList JSON-LD. The options builder is stubbed
// with the generated key shape, so the fetch is an assertable mock.
jest.mock("@/shared/api/generated/products/products", () => {
  const findAll = jest.fn().mockResolvedValue({ data: [], meta: {} });
  return {
    productControllerFindAll: findAll,
    getProductControllerFindAllQueryOptions: (params: unknown) => ({
      queryKey: ["/api/products", params],
      queryFn: () => findAll(params),
    }),
  };
});
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
// Slug-redirect lookup (TASK-285) — mocked per-case below.
jest.mock("@/shared/lib/slug-redirect", () => ({
  resolveSlugRedirect: jest.fn(),
}));
// React `cache()` memoizes only inside a server request, which Jest never opens —
// outside one it is a pass-through. Stand in for the request scope, emptied
// between tests (TASK-703; same stand-in as catalog/[category]/[device]).
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

import CategoryLandingPage, { generateMetadata } from "./page";
import { notFound, permanentRedirect } from "next/navigation";
import { categoryControllerGetCategoryTree } from "@/shared/api/generated/categories/categories";
import { resolveSlugRedirect } from "@/shared/lib/slug-redirect";
import { productControllerFindAll } from "@/shared/api/generated/products/products";
import type { CategoryTreeNodeEntity } from "@/shared/api/generated/models";
import { SITE_URL } from "@/shared/config";
import {
  findDehydratedQueryKeys,
  findJsonLdSchemas,
} from "@/shared/test/element-tree";
import { buildCatalogListingParams } from "@/widgets/product-list/model/listing-params";

const getTree = categoryControllerGetCategoryTree as jest.MockedFunction<
  typeof categoryControllerGetCategoryTree
>;
const findAll = productControllerFindAll as jest.MockedFunction<
  typeof productControllerFindAll
>;
const resolveRedirect = resolveSlugRedirect as jest.MockedFunction<
  typeof resolveSlugRedirect
>;

function makeTree(): CategoryTreeNodeEntity[] {
  return [
    {
      id: "cat-1",
      slug: "chohly",
      name: "Чохли",
      description: null,
      metaTitle: null,
      metaDescription: null,
      children: [],
    } as unknown as CategoryTreeNodeEntity,
  ];
}

afterEach(() => {
  jest.clearAllMocks();
  (
    globalThis as { __requestMemos?: Map<string, unknown>[] }
  ).__requestMemos?.forEach((memo) => memo.clear());
});

describe("categories/[slug] — an API outage is not a 404 (TASK-793)", () => {
  const props = {
    params: Promise.resolve({ slug: "chohly" }),
    searchParams: Promise.resolve({}),
  };

  it("rethrows a failed tree read from the page instead of calling notFound()", async () => {
    getTree.mockRejectedValue({ response: { status: 502 } });

    await expect(CategoryLandingPage(props)).rejects.toEqual({
      response: { status: 502 },
    });
    expect(notFound).not.toHaveBeenCalled();
    expect(resolveRedirect).not.toHaveBeenCalled();
  });

  it("rethrows from generateMetadata too, rather than a 404-shaped fallback", async () => {
    getTree.mockRejectedValue(new Error("timeout of 5000ms exceeded"));

    await expect(generateMetadata(props)).rejects.toThrow("timeout");
  });

  it("still 404s a slug the tree genuinely does not have", async () => {
    getTree.mockResolvedValue({ data: makeTree() } as never);
    resolveRedirect.mockResolvedValue(null);

    await expect(
      CategoryLandingPage({
        params: Promise.resolve({ slug: "nope" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("categories/[slug] — link preview (TASK-568/569)", () => {
  const props = {
    params: Promise.resolve({ slug: "chohly" }),
    searchParams: Promise.resolve({}),
  };

  it("uses the category's own tile picture before the store-wide card", async () => {
    const [node] = makeTree();
    getTree.mockResolvedValue({
      data: [{ ...node, image: "https://cdn.example.com/chohly.jpg" }],
    } as never);

    const meta = await generateMetadata(props);

    const og = meta.openGraph as { images?: unknown; title?: string };
    expect(og.images).toEqual([
      { url: "https://cdn.example.com/chohly.jpg", alt: og.title },
    ]);
  });

  it("sizes the admin-chosen card and gives it the page title as alt", async () => {
    const [node] = makeTree();
    getTree.mockResolvedValue({
      data: [
        {
          ...node,
          ogImage: "https://cdn.example.com/og.jpg",
          image: "https://cdn.example.com/chohly.jpg",
        },
      ],
    } as never);

    const meta = await generateMetadata(props);

    const og = meta.openGraph as { images?: unknown; title?: string };
    expect(og.images).toEqual([
      {
        url: "https://cdn.example.com/og.jpg",
        width: 1200,
        height: 630,
        alt: og.title,
      },
    ]);
  });
});

describe("categories/[slug] — one tree read per render (TASK-703)", () => {
  it("generateMetadata and the page body share a single category-tree request", async () => {
    getTree.mockResolvedValue({ data: makeTree() } as never);
    const props = {
      params: Promise.resolve({ slug: "chohly" }),
      searchParams: Promise.resolve({}),
    };

    await generateMetadata(props);
    await CategoryLandingPage(props);

    expect(getTree).toHaveBeenCalledTimes(1);
  });
});

describe("categories/[slug] slug-redirect (TASK-285 Крок W)", () => {
  const runPage = (slug: string) =>
    CategoryLandingPage({
      params: Promise.resolve({ slug }),
      searchParams: Promise.resolve({}),
    });

  it("permanently redirects a renamed slug to its current address", async () => {
    getTree.mockResolvedValue({ data: [] } as never); // dead slug — not in the active tree
    resolveRedirect.mockResolvedValue("novyi-slug");

    await expect(runPage("staryi-slug")).rejects.toThrow(
      "NEXT_REDIRECT:/categories/novyi-slug",
    );

    expect(resolveRedirect).toHaveBeenCalledWith("CATEGORY", "staryi-slug");
    expect(permanentRedirect).toHaveBeenCalledWith("/categories/novyi-slug");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("still 404s a dead slug with no redirect row (regression)", async () => {
    getTree.mockResolvedValue({ data: [] } as never);
    resolveRedirect.mockResolvedValue(null);

    await expect(runPage("never-existed")).rejects.toThrow("NEXT_NOT_FOUND");

    expect(permanentRedirect).not.toHaveBeenCalled();
    expect(notFound).toHaveBeenCalled();
  });

  it("never consults the redirect ledger when the category resolves", async () => {
    getTree.mockResolvedValue({ data: makeTree() } as never);

    await expect(runPage("chohly")).resolves.toBeDefined();

    expect(resolveRedirect).not.toHaveBeenCalled();
    expect(permanentRedirect).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("categories/[slug] — the first HTML carries the product cards (TASK-563)", () => {
  const run = (query: Record<string, string> = {}) =>
    CategoryLandingPage({
      params: Promise.resolve({ slug: "chohly" }),
      searchParams: Promise.resolve(query),
    });

  it("prefetches the grid's page under the key the locked view reads", async () => {
    getTree.mockResolvedValue({ data: makeTree() } as never);
    const query = { category: "other", page: "2", onSale: "true" };

    const tree = await run(query);

    // The segment wins over a `?category=` in the query, exactly as in the view.
    const expected = buildCatalogListingParams(
      (key) => query[key as keyof typeof query],
      { categorySlug: "chohly" },
    );
    expect(expected.category).toBe("chohly");
    expect(findAll).toHaveBeenCalledTimes(1);
    expect(findAll).toHaveBeenCalledWith(expected);
    expect(findDehydratedQueryKeys(tree)).toEqual([
      ["/api/products", expected],
    ]);
  });

  it("builds the ItemList from that same page — no second product request", async () => {
    getTree.mockResolvedValue({ data: makeTree() } as never);
    findAll.mockResolvedValueOnce({
      data: [{ id: "p1", name: "Чохол", slug: "chohol", primaryImage: null }],
      meta: {},
    } as never);

    const tree = await run();

    const itemList = findJsonLdSchemas(tree).find(
      (schema) => schema["@type"] === "ItemList",
    );
    expect(itemList?.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        item: {
          "@type": "Product",
          name: "Чохол",
          url: `${SITE_URL}/products/chohol`,
        },
      },
    ]);
    expect(findAll).toHaveBeenCalledTimes(1);
  });

  it("renders without the prefetch when the product read fails", async () => {
    getTree.mockResolvedValue({ data: makeTree() } as never);
    findAll.mockRejectedValueOnce(new Error("timeout of 5000ms exceeded"));

    const tree = await run();

    expect(findDehydratedQueryKeys(tree)).toEqual([]);
    expect(findJsonLdSchemas(tree).map((schema) => schema["@type"])).toEqual([
      "BreadcrumbList",
    ]);
  });
});
