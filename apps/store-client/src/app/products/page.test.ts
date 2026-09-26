// The route imports the widgets barrel (ProductListView — a heavy client tree);
// none of these tests render it, so stub the barrel (same idiom as
// categories/[slug]/page.test.ts).
jest.mock("@/widgets", () => ({
  ProductListView: () => null,
  ProductListSkeleton: () => null,
}));
jest.mock("@/shared/api/generated/categories/categories", () => ({
  categoryControllerGetCategoryTree: jest.fn(),
}));
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
import type {
  CategoryTreeNodeEntity,
  PageEntity,
} from "@/shared/api/generated/models";
import { fetchPublishedPage } from "@/shared/api/pages-server";
import { SITE_URL, dict } from "@/shared/config";
import ProductsPage, { generateMetadata } from "./page";

const getTree = categoryControllerGetCategoryTree as jest.MockedFunction<
  typeof categoryControllerGetCategoryTree
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

  it("does not read the tree at all on the unfiltered listing", async () => {
    await generateMetadata(props());
    await ProductsPage(props());

    expect(getTree).not.toHaveBeenCalled();
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
