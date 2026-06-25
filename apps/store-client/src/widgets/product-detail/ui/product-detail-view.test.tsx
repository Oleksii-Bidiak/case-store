import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { ProductDetailView } from "./product-detail-view";

// next/navigation is unavailable under jsdom — the view itself doesn't route,
// but child components may read it defensively.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/products/test-product",
}));

const baseProduct = {
  id: "product-1",
  name: "Test Product",
  slug: "test-product",
  description: "A nice product",
  price: "12.99",
  compareAtPrice: "19.99",
  sku: "TP-001",
  categoryId: "cat-1",
  isActive: true,
  ratingAverage: 0,
  ratingCount: 0,
  createdAt: "2026-06-01T00:00:00.000Z",
  primaryImage: null,
};

/** Detail envelope where the cheapest active variant is NOT first by name. */
function detailEnvelope() {
  return {
    data: baseProduct,
    category: { id: "cat-1", name: "Cases", slug: "cases" },
    variants: [
      // Alphabetically first, but the pricier one — must NOT be the default.
      {
        id: "variant-aaa",
        name: "AAA Premium",
        price: "29.99",
        stock: 5,
        isActive: true,
      },
      // Cheapest active — should become the default selection.
      {
        id: "variant-zzz",
        name: "ZZZ Basic",
        price: "12.99",
        stock: 5,
        isActive: true,
      },
    ],
    images: [],
  };
}

describe("ProductDetailView — default variant selection (TASK-126)", () => {
  beforeEach(() => {
    server.use(
      http.get("*/api/products/:slug", () =>
        HttpResponse.json(detailEnvelope()),
      ),
      // ProductRelated fires a list query; return an empty page.
      http.get("*/api/products", () =>
        HttpResponse.json({
          data: [],
          meta: { total: 0, page: 1, limit: 5, totalPages: 0 },
        }),
      ),
    );
  });

  it("defaults to the cheapest active variant's price, not the first by name", async () => {
    renderWithProviders(<ProductDetailView slug="test-product" />);

    // Wait for the product to load.
    expect(
      await screen.findByRole("heading", { name: "Test Product" }),
    ).toBeInTheDocument();

    // The cheapest active variant (ZZZ Basic @ 12.99) is pre-selected, not the
    // alphabetically-first, pricier one (AAA Premium @ 29.99).
    const selected = await screen.findByRole("button", { name: /ZZZ Basic/i });
    await waitFor(() =>
      expect(selected).toHaveAttribute("aria-pressed", "true"),
    );

    const other = screen.getByRole("button", { name: /AAA Premium/i });
    expect(other).toHaveAttribute("aria-pressed", "false");
  });
});
