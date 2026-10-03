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

  it("fills the height of its grid cell so a row of cards lines up (TASK-415)", () => {
    const { container } = renderWithProviders(
      <ProductCard product={product()} />,
    );

    // Titles wrap to two lines on some cards and one on others; without this the
    // card only grew as tall as its own content and rows looked ragged.
    expect(container.querySelector("article")).toHaveClass("h-full");
  });

  it("declares no second image transition on top of ProductCardImage (TASK-415)", () => {
    const { container } = renderWithProviders(
      <ProductCard product={product()} />,
    );

    // The wrapper used to carry `[&_img]:transition-transform
    // [&_img]:duration-500`, which out-specified the duration declared next to
    // the scale in ProductCardImage. One declaration, one duration.
    expect(container.innerHTML).not.toContain("[&_img]:");
  });

  it("keeps a sold-out product clickable — it stays browsable, just dimmed", () => {
    renderWithProviders(<ProductCard product={product({ inStock: false })} />);

    expect(screen.getByRole("link", { name: "Чохол Armor" })).toHaveAttribute(
      "href",
      "/products/chohol-armor",
    );
  });
});

describe("ProductCard — reserveRows (TASK-869)", () => {
  // The catalogue grid swaps a skeleton for cards; the skeleton draws a
  // two-line title, a rating row and a colour-dots row. Without the reserve a
  // single-colour, unrated card came out 22–44px shorter than its placeholder
  // and every row below it jumped up when the cards landed.
  it("keeps an empty box for the rating and colour rows and two title lines", () => {
    const { container } = renderWithProviders(
      <ProductCard product={product()} reserveRows />,
    );

    const rating = container.querySelector('[data-row-slot="rating"]');
    const colors = container.querySelector('[data-row-slot="colors"]');
    expect(rating).toHaveClass("h-4");
    expect(rating).toHaveAttribute("aria-hidden", "true");
    expect(colors).toHaveClass("h-3.5");
    expect(colors).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("heading", { level: 3 })).toHaveClass("min-h-10");
  });

  it("draws the real rows instead of the slots when the product has them", () => {
    const { container } = renderWithProviders(
      <ProductCard
        product={product({
          ratingAverage: 4.5,
          ratingCount: 3,
          variantSummary: {
            groupId: "g1",
            variantCount: 2,
            priceFrom: "299.00",
            defaultVariantId: "p1",
            defaultVariantSlug: "chohol-armor",
            defaultInStock: true,
            colors: [
              { value: "Чорний", productId: "p1", inStock: true },
              { value: "Білий", productId: "p2", inStock: true },
            ],
          },
        } as Partial<PublicProductEntity>)}
        reserveRows
      />,
    );

    expect(container.querySelector("[data-row-slot]")).toBeNull();
    expect(
      screen.getByLabelText(dict.product.ratingAria(4.5, 3)),
    ).toBeInTheDocument();
    // Pinned to the swatch height so a «+N» chip cannot grow the row.
    expect(screen.getByRole("img", { name: /Чорний/ })).toHaveClass("h-3.5");
  });

  it("stays content-sized everywhere else (rails, search, home)", () => {
    const { container } = renderWithProviders(
      <ProductCard product={product()} />,
    );

    expect(container.querySelector("[data-row-slot]")).toBeNull();
    expect(screen.getByRole("heading", { level: 3 })).not.toHaveClass(
      "min-h-10",
    );
  });
});
