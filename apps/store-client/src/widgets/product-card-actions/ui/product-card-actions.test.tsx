import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeCart } from "@/shared/test/msw-handlers";
import { dict } from "@/shared/config";
import type { PublicProductEntity } from "@/shared/api/generated/models";
import { ProductCardActions } from "./product-card-actions";

/**
 * A NON-cheapest sibling position («Double Pack»): its own id/stock differ from
 * the group's default (cheapest) variant («Single Pack») carried in
 * `variantSummary`. TASK-233 — quick-add must target the card's OWN position.
 */
function makeDoublePack(
  overrides: Partial<PublicProductEntity> = {},
): PublicProductEntity {
  return {
    id: "product-double-pack",
    name: "USB-C Cable — Double Pack",
    slug: "usb-c-cable-double-pack",
    description: null,
    price: "24.99",
    compareAtPrice: null,
    sku: "CBL-2PK",
    inStock: true,
    lowStock: false,
    categoryId: "cat-1",
    groupId: "group-1",
    attributes: { pack: "double" },
    positionOrder: 1,
    isActive: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ratingAverage: null,
    ratingCount: 0,
    primaryImage: null,
    variantSummary: {
      groupId: "group-1",
      variantCount: 2,
      priceFrom: "12.99",
      defaultVariantId: "product-single-pack",
      defaultVariantSlug: "usb-c-cable-single-pack",
      defaultInStock: true,
      colors: [],
    },
    ...overrides,
  } as PublicProductEntity;
}

describe("ProductCardActions — quick-add targets the card's own position (TASK-233)", () => {
  it("adds the card's OWN product id to the cart, not the group's cheapest sibling", async () => {
    const captured: Array<{ productId?: string; quantity?: number }> = [];
    server.use(
      http.post("*/api/cart/items", async ({ request }) => {
        captured.push(
          (await request.json()) as { productId?: string; quantity?: number },
        );
        return HttpResponse.json(makeCart(), { status: 201 });
      }),
    );

    const product = makeDoublePack();
    renderWithProviders(<ProductCardActions product={product} />);

    await userEvent.click(
      screen.getByRole("button", {
        name: dict.productCard.buyAria(product.name),
      }),
    );

    await waitFor(() => expect(captured).toHaveLength(1));
    expect(captured[0].productId).toBe("product-double-pack");
    expect(captured[0].productId).not.toBe(
      product.variantSummary.defaultVariantId,
    );
  });

  it("shows out-of-stock and disables the button when the OWN position has no stock (group default in stock)", () => {
    renderWithProviders(
      <ProductCardActions product={makeDoublePack({ inStock: false })} />,
    );

    // Out of stock → the aria-label override is dropped; the accessible name is
    // the visible "Немає в наявності" label.
    const button = screen.getByRole("button", {
      name: dict.addToCart.outOfStock,
    });
    expect(button).toBeDisabled();
    // The string appears on both the availability line and the button label —
    // scope to the <p> availability line.
    expect(
      screen.getByText(dict.productCard.outOfStockLine, { selector: "p" }),
    ).toBeInTheDocument();
  });

  it("keeps quick-add enabled when the OWN position is in stock even if the group default is out of stock", () => {
    const product = makeDoublePack();
    product.variantSummary = {
      ...product.variantSummary,
      defaultInStock: false,
    };

    renderWithProviders(<ProductCardActions product={product} />);

    expect(
      screen.getByRole("button", {
        name: dict.productCard.buyAria(product.name),
      }),
    ).toBeEnabled();
    expect(screen.getByText(dict.productCard.inStockLine)).toBeInTheDocument();
  });
});
