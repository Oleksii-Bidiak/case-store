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
// Slug-redirect lookup (TASK-285) — mocked per-case below.
jest.mock("@/shared/lib/slug-redirect", () => ({
  resolveSlugRedirect: jest.fn(),
}));

import CategoryLandingPage from "./page";
import { notFound, permanentRedirect } from "next/navigation";
import { categoryControllerGetCategoryTree } from "@/shared/api/generated/categories/categories";
import { resolveSlugRedirect } from "@/shared/lib/slug-redirect";
import type { CategoryTreeNodeEntity } from "@/shared/api/generated/models";

const getTree = categoryControllerGetCategoryTree as jest.MockedFunction<
  typeof categoryControllerGetCategoryTree
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

afterEach(() => jest.clearAllMocks());

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
