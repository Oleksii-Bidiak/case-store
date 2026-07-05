import { http, HttpResponse } from "msw";
import { renderWithProviders, screen } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { PopularRail } from "./product-grid";

function variantSummary(overrides: Record<string, unknown> = {}) {
  return {
    groupId: null,
    variantCount: 1,
    priceFrom: "12.99",
    defaultVariantId: "product-1",
    defaultVariantSlug: "tempered-glass",
    defaultInStock: true,
    colors: [],
    ...overrides,
  };
}

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "product-1",
    name: "Tempered Glass",
    slug: "tempered-glass",
    description: "A nice product",
    price: "12.99",
    compareAtPrice: null,
    sku: "TG-1",
    inStock: true,
    lowStock: false,
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
    variantSummary: variantSummary(),
    ...overrides,
  };
}

function listEnvelope(products: ReturnType<typeof makeProduct>[]) {
  return {
    data: products,
    meta: { total: products.length, page: 1, limit: 8, totalPages: 1 },
  };
}

describe("PopularRail — quick-add stock guard (TASK-144 / TASK-077 / TASK-162 / TASK-233)", () => {
  it("disables the quick-add button with an out-of-stock label when the card's own position has no stock", async () => {
    server.use(
      http.get("*/api/products", () =>
        HttpResponse.json(
          // Own position out of stock; the group's default (cheapest) sibling
          // stays in stock — the card must follow its OWN signal (TASK-233).
          listEnvelope([
            makeProduct({
              inStock: false,
              variantSummary: variantSummary({ defaultInStock: true }),
            }),
          ]),
        ),
      ),
    );

    renderWithProviders(<PopularRail />);

    // Out of stock → the override aria-label is dropped, so the accessible name
    // is the visible "Немає в наявності" label (conveys why it is disabled).
    const button = await screen.findByRole("button", {
      name: dict.addToCart.outOfStock,
    });
    expect(button).toBeDisabled();
  });

  it("renders an enabled quick-add button labelled per product when the default variant is in stock", async () => {
    server.use(
      http.get("*/api/products", () =>
        HttpResponse.json(listEnvelope([makeProduct()])),
      ),
    );

    renderWithProviders(<PopularRail />);

    const button = await screen.findByRole("button", {
      name: dict.productCard.buyAria("Tempered Glass"),
    });
    expect(button).toBeEnabled();
  });
});
