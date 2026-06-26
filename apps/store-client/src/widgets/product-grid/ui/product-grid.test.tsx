import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { ProductGrid } from "./product-grid";

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "product-1",
    name: "Tempered Glass",
    slug: "tempered-glass",
    description: "A nice product",
    price: "12.99",
    compareAtPrice: null,
    sku: "TG-1",
    stock: 7,
    categoryId: "cat-1",
    groupId: null,
    attributes: {},
    positionOrder: 0,
    isActive: true,
    ratingAverage: 0,
    ratingCount: 0,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    primaryImage: null,
    ...overrides,
  };
}

function listEnvelope(products: ReturnType<typeof makeProduct>[]) {
  return {
    data: products,
    meta: { total: products.length, page: 1, limit: 8, totalPages: 1 },
  };
}

describe("ProductGrid — stock guard (TASK-144)", () => {
  it("disables the add-to-cart button with an out-of-stock label for a stock-0 product", async () => {
    server.use(
      http.get("*/api/products", () =>
        HttpResponse.json(listEnvelope([makeProduct({ stock: 0 })])),
      ),
    );

    renderWithProviders(<ProductGrid />);

    const button = await screen.findByRole("button", {
      name: dict.addToCart.outOfStock,
    });
    expect(button).toBeDisabled();
  });

  it("renders an enabled add-to-cart button for an in-stock product", async () => {
    server.use(
      http.get("*/api/products", () =>
        HttpResponse.json(listEnvelope([makeProduct({ stock: 5 })])),
      ),
    );

    renderWithProviders(<ProductGrid />);

    const button = await screen.findByRole("button", {
      name: dict.addToCart.idle,
    });
    expect(button).toBeEnabled();
  });
});
