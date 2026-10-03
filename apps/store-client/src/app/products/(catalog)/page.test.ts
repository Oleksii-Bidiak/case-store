// The route imports the widgets barrel (ProductListView — a heavy client tree);
// none of these tests render it, so stub the barrel (same idiom as
// categories/[slug]/page.test.ts).
jest.mock("@/widgets", () => ({
  ProductListView: () => null,
  ProductListSkeleton: () => null,
}));
jest.mock("@/shared/api/generated/categories/categories", () => ({
  categoryControllerGetCategoryTree: jest.fn(),
  getCategoryControllerGetCategoryTreeQueryKey: () => ["/api/categories/tree"],
}));
// The grid's server prefetch (TASK-563). The options builder is stubbed with the
// generated key shape, so the fetch is an assertable mock rather than axios.
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
// The `products` HUB row (TASK-549) — mocked per case below.
jest.mock("@/shared/api/pages-server", () => ({
  fetchPublishedPage: jest.fn().mockResolvedValue(null),
}));
// A modern (slug) URL never reaches the legacy uuid lookup; pin that here so the
// tree mock below counts only the category resolution this file is about.
jest.mock("@/shared/lib/legacy-catalog-params", () => ({
  resolveLegacyCatalogParams: jest.fn().mockResolvedValue(null),
  withQuery: jest.fn(),
}));
jest.mock("next/navigation", () => ({
  permanentRedirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
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

import { categoryControllerGetCategoryTree } from "@/shared/api/generated/categories/categories";
import { productControllerFindAll } from "@/shared/api/generated/products/products";
import type {
  CategoryTreeNodeEntity,
  PageEntity,
} from "@/shared/api/generated/models";
import { fetchPublishedPage } from "@/shared/api/pages-server";
import { SITE_URL, dict } from "@/shared/config";
import {
  findDehydratedQueryKeys,
  findJsonLdSchemas,
  findPropValues,
} from "@/shared/test/element-tree";
import { buildCatalogListingParams } from "@/widgets/product-list/model/listing-params";
import ProductsPage, { generateMetadata } from "./page";

const getTree = categoryControllerGetCategoryTree as jest.MockedFunction<
  typeof categoryControllerGetCategoryTree
>;
const findAll = productControllerFindAll as jest.MockedFunction<
  typeof productControllerFindAll
>;
const fetchPage = fetchPublishedPage as jest.MockedFunction<
  typeof fetchPublishedPage
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
      ogImage: null,
      image: null,
      children: [],
    } as unknown as CategoryTreeNodeEntity,
  ];
}

const props = (searchParams: Record<string, string> = {}) => ({
  searchParams: Promise.resolve(searchParams),
});

afterEach(() => {
  jest.clearAllMocks();
  // `clearAllMocks` keeps a `mockResolvedValue` implementation, and the page
  // reads the tree on every render now (TASK-515) — a tree set in one describe
  // would land in the dehydrated state of every later test. Back to "no tree".
  getTree.mockReset();
  (
    globalThis as { __requestMemos?: Map<string, unknown>[] }
  ).__requestMemos?.forEach((memo) => memo.clear());
});

describe("products — one tree read per render (TASK-703)", () => {
  it("generateMetadata and the page body share a single category-tree request", async () => {
    getTree.mockResolvedValue({ data: makeTree() } as never);

    await generateMetadata(props({ category: "chohly" }));
    await ProductsPage(props({ category: "chohly" }));

    expect(getTree).toHaveBeenCalledTimes(1);
  });

  it("reads the tree once on the unfiltered listing — for the chips row, not the metadata", async () => {
    getTree.mockResolvedValue({ data: makeTree() } as never);

    await generateMetadata(props());
    expect(getTree).not.toHaveBeenCalled();

    await ProductsPage(props());
    expect(getTree).toHaveBeenCalledTimes(1);
  });
});

/**
 * TASK-515 — the category chips row used to be absent from the server HTML and
 * mount after hydration, pushing the toolbar and the grid 60px down out of the
 * place the skeleton had held for them.
 */
describe("products — the category chips row is in the first HTML (TASK-515)", () => {
  const withChildren = (): CategoryTreeNodeEntity[] => {
    const [node] = makeTree();
    return [
      {
        ...node,
        children: [{ ...node, id: "cat-2", slug: "chohly-iphone" }],
      } as CategoryTreeNodeEntity,
    ];
  };

  it("hands the tree to the view under the chips query's key", async () => {
    getTree.mockResolvedValue({ data: makeTree() } as never);

    const tree = await ProductsPage(props());

    expect(findDehydratedQueryKeys(tree)).toContainEqual([
      "/api/categories/tree",
    ]);
    expect(findPropValues(tree, "categoryTreePrefetched")).toEqual([true]);
  });

  it("reserves the subcategory row in the fallback when the category has one", async () => {
    getTree.mockResolvedValue({ data: withChildren() } as never);

    const filtered = await ProductsPage(props({ category: "chohly-iphone" }));
    const plain = await ProductsPage(props());

    const [filteredFallback] = findPropValues(filtered, "fallback");
    expect(findPropValues(filteredFallback, "withSubcategoryChips")).toEqual([
      true,
    ]);
    const [plainFallback] = findPropValues(plain, "fallback");
    expect(findPropValues(plainFallback, "withSubcategoryChips")).toEqual([
      false,
    ]);
  });

  it("does not claim a tree the server could not read", async () => {
    getTree.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const tree = await ProductsPage(props());

    expect(findDehydratedQueryKeys(tree)).not.toContainEqual([
      "/api/categories/tree",
    ]);
    expect(findPropValues(tree, "categoryTreePrefetched")).toEqual([false]);
  });
});

describe("products?category= — link preview (TASK-569)", () => {
  it("uses the category's own tile picture, with the page title as alt", async () => {
    const [node] = makeTree();
    getTree.mockResolvedValue({
      data: [{ ...node, image: "https://cdn.example.com/chohly.jpg" }],
    } as never);

    const meta = await generateMetadata(props({ category: "chohly" }));

    const og = meta.openGraph as { images?: unknown; title?: string };
    expect(og.images).toEqual([
      { url: "https://cdn.example.com/chohly.jpg", alt: og.title },
    ]);
  });
});

describe("products — owner-editable meta for the unfiltered catalogue (TASK-549)", () => {
  function hubRow(overrides: Partial<PageEntity> = {}): PageEntity {
    return {
      slug: "products",
      kind: "HUB",
      title: "Розділ «Каталог»",
      excerpt: null,
      metaTitle: "Каталог чохлів і техніки | CaseStore",
      metaDescription: "Опис каталогу від власника.",
      ogImage: null,
      ...overrides,
    } as unknown as PageEntity;
  }

  it("takes title and description from the products HUB row", async () => {
    fetchPage.mockResolvedValue(hubRow());

    const meta = await generateMetadata(props());

    expect(fetchPage).toHaveBeenCalledWith("products", "HUB");
    expect(meta.title).toEqual({
      absolute: "Каталог чохлів і техніки | CaseStore",
    });
    expect(meta.description).toBe("Опис каталогу від власника.");
    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/products`);
    expect(meta.robots).toBeUndefined();
  });

  it("falls back to the dictionary when there is no row", async () => {
    fetchPage.mockResolvedValue(null);

    const meta = await generateMetadata(props());

    expect(meta.description).toBe(dict.meta.productsDescription);
    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/products`);
  });

  it("keeps ?page=N in the canonical of a clean paged view", async () => {
    const meta = await generateMetadata(props({ page: "3" }));

    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/products?page=3`);
  });

  it("noindexes a filtered view and drops its canonical", async () => {
    fetchPage.mockResolvedValue(hubRow());

    const meta = await generateMetadata(props({ search: "чохол" }));

    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates).toBeUndefined();
    // The preview of a shared search link still names the clean listing.
    expect(meta.openGraph?.url).toBe(`${SITE_URL}/products`);
  });
});

describe("products — the first HTML carries the product cards (TASK-563)", () => {
  const listing = {
    data: [
      {
        id: "p1",
        name: "Чохол MagSafe",
        slug: "chohol-magsafe",
        primaryImage: { url: "https://cdn.example.com/p1.jpg" },
      },
      { id: "p2", name: "Скло", slug: "sklo", primaryImage: null },
    ],
    meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
  };

  it("prefetches the grid's page under the key the client view reads", async () => {
    findAll.mockResolvedValue(listing as never);
    const query: Record<string, string> = {
      search: " магніт ",
      inStock: "true",
      page: "2",
    };

    const tree = await ProductsPage(props(query));

    const expected = buildCatalogListingParams((key) => query[key]);
    expect(findAll).toHaveBeenCalledWith(expected);
    expect(findDehydratedQueryKeys(tree)).toEqual([
      ["/api/products", expected],
    ]);
  });

  it("describes the same products as an ItemList", async () => {
    findAll.mockResolvedValue(listing as never);

    const tree = await ProductsPage(props());

    const itemList = findJsonLdSchemas(tree).find(
      (schema) => schema["@type"] === "ItemList",
    );
    expect(itemList?.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        item: {
          "@type": "Product",
          name: "Чохол MagSafe",
          url: `${SITE_URL}/products/chohol-magsafe`,
          image: "https://cdn.example.com/p1.jpg",
        },
      },
      {
        "@type": "ListItem",
        position: 2,
        item: {
          "@type": "Product",
          name: "Скло",
          url: `${SITE_URL}/products/sklo`,
        },
      },
    ]);
  });

  it("still renders when the prefetch fails — the grid fetches on the client, as before", async () => {
    findAll.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const tree = await ProductsPage(props());

    expect(findDehydratedQueryKeys(tree)).toEqual([]);
    expect(findJsonLdSchemas(tree).map((schema) => schema["@type"])).toEqual([
      "BreadcrumbList",
    ]);
  });
});
