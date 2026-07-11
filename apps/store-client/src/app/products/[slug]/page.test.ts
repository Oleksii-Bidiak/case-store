// The route imports the widgets barrel (ProductDetailView — heavy client
// tree); the redirect tests never render it, so stub the barrel.
jest.mock("@/widgets", () => ({
  ProductDetailView: () => null,
  ProductDetailSkeleton: () => null,
}));
// Product fetch used by buildProductPageSchemas — rejects to simulate a 404.
jest.mock("@/shared/api/generated/products/products", () => ({
  productControllerFindBySlug: jest.fn(),
}));
jest.mock("@/shared/api/faq-server", () => ({
  fetchFaqItems: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/shared/api/seo-settings-server", () => ({
  fetchSeoSettings: jest.fn().mockResolvedValue(null),
}));
// Next's permanentRedirect() throws a special signal; mock it with a throwing
// jest.fn() so the tests can assert the redirect fired.
jest.mock("next/navigation", () => ({
  permanentRedirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
// Slug-redirect lookup (TASK-285) — mocked per-case below.
jest.mock("@/shared/lib/slug-redirect", () => ({
  resolveSlugRedirect: jest.fn(),
}));

import ProductDetailPage from "./page";
import { permanentRedirect } from "next/navigation";
import { productControllerFindBySlug } from "@/shared/api/generated/products/products";
import { resolveSlugRedirect } from "@/shared/lib/slug-redirect";

const findBySlug = productControllerFindBySlug as jest.MockedFunction<
  typeof productControllerFindBySlug
>;
const resolveRedirect = resolveSlugRedirect as jest.MockedFunction<
  typeof resolveSlugRedirect
>;

afterEach(() => jest.clearAllMocks());

describe("products/[slug] slug-redirect (TASK-285)", () => {
  const runPage = (slug: string) =>
    ProductDetailPage({ params: Promise.resolve({ slug }) });

  it("permanently redirects a renamed slug to its current address", async () => {
    findBySlug.mockRejectedValue(
      Object.assign(new Error("404"), { response: { status: 404 } }),
    );
    resolveRedirect.mockResolvedValue("novyi-slug");

    await expect(runPage("staryi-slug")).rejects.toThrow(
      "NEXT_REDIRECT:/products/novyi-slug",
    );

    expect(resolveRedirect).toHaveBeenCalledWith("PRODUCT", "staryi-slug");
    expect(permanentRedirect).toHaveBeenCalledWith("/products/novyi-slug");
  });

  it("falls through to the client-side not-found for a dead slug with no redirect row (regression)", async () => {
    findBySlug.mockRejectedValue(
      Object.assign(new Error("404"), { response: { status: 404 } }),
    );
    resolveRedirect.mockResolvedValue(null);

    // No throw — the page renders and ProductDetailView owns the 404 UI.
    await expect(runPage("never-existed")).resolves.toBeDefined();

    expect(permanentRedirect).not.toHaveBeenCalled();
  });

  it("never consults the redirect ledger when the product resolves", async () => {
    findBySlug.mockResolvedValue({
      data: {
        id: "product-1",
        name: "Чохол",
        slug: "chohol",
        description: null,
        price: "29.99",
        metaTitle: null,
        metaDescription: null,
      },
      images: [],
      category: { id: "cat-1", name: "Чохли" },
    } as never);

    await expect(runPage("chohol")).resolves.toBeDefined();

    expect(resolveRedirect).not.toHaveBeenCalled();
    expect(permanentRedirect).not.toHaveBeenCalled();
  });
});
