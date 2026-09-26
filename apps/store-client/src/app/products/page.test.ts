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
import type { CategoryTreeNodeEntity } from "@/shared/api/generated/models";
import ProductsPage, { generateMetadata } from "./page";

const getTree = categoryControllerGetCategoryTree as jest.MockedFunction<
  typeof categoryControllerGetCategoryTree
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
