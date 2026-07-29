import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import type { PublicProductEntity } from "@/shared/api/generated/models";
import { ProductCard } from "./product-card";

function product(over: Partial<PublicProductEntity> = {}): PublicProductEntity {
  return {
    id: "p1",
    name: "Чохол Armor",
    slug: "chohol-armor",
    description: null,
    price: "299.00",
    compareAtPrice: null,
    sku: "A1",
    inStock: true,
    lowStock: false,
    categoryId: "c1",
    groupId: null,
    attributes: {},
    positionOrder: 0,
    isActive: true,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    ratingAverage: null,
    ratingCount: 0,
    ...over,
  } as PublicProductEntity;
}

describe("ProductCard — availability (TASK-362)", () => {
  // Before this, a sold-out product looked identical to an available one in the
  // grid; a shopper only found out on the product page.
  it("marks a sold-out product on the card itself", () => {
    renderWithProviders(<ProductCard product={product({ inStock: false })} />);

    expect(screen.getByText(dict.product.outOfStock)).toBeInTheDocument();
  });

  it("says nothing about availability when the product is in stock", () => {
    renderWithProviders(<ProductCard product={product({ inStock: true })} />);

    expect(screen.queryByText(dict.product.outOfStock)).toBeNull();
  });

  // "New" is a reason to look; "sold out" is a reason not to. Showing both on
  // one card advertises something the shopper cannot act on.
  it("suppresses the New badge on a sold-out product", () => {
    renderWithProviders(
      <ProductCard
        product={product({
          inStock: false,
          createdAt: new Date().toISOString(),
        })}
      />,
    );

    expect(screen.queryByText(dict.product.newBadge)).toBeNull();
    expect(screen.getByText(dict.product.outOfStock)).toBeInTheDocument();
  });

  it("still shows the New badge on an available recent product", () => {
    renderWithProviders(
      <ProductCard
        product={product({
          inStock: true,
          createdAt: new Date().toISOString(),
        })}
      />,
    );

    expect(screen.getByText(dict.product.newBadge)).toBeInTheDocument();
  });

  it("keeps a sold-out product clickable — it stays browsable, just dimmed", () => {
    renderWithProviders(<ProductCard product={product({ inStock: false })} />);

    expect(screen.getByRole("link", { name: "Чохол Armor" })).toHaveAttribute(
      "href",
      "/products/chohol-armor",
    );
  });
});
