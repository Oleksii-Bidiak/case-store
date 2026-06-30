import type { ProductVariantColorEntity } from "@/shared/api/generated/models";
import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { ColorDots } from "./color-dots";

function color(
  value: string,
  overrides: Partial<ProductVariantColorEntity> = {},
): ProductVariantColorEntity {
  return {
    value,
    productId: `p-${value}`,
    slug: value.toLowerCase(),
    inStock: true,
    ...overrides,
  };
}

describe("ColorDots (TASK-077)", () => {
  it("renders nothing for a single colour (not a meaningful choice)", () => {
    const { container } = renderWithProviders(
      <ColorDots colors={[color("Black")]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("exposes every colour in one accessible label", () => {
    renderWithProviders(
      <ColorDots colors={[color("Black"), color("White"), color("Blue")]} />,
    );

    expect(
      screen.getByRole("img", {
        name: dict.productCard.colorsAvailable(["Black", "White", "Blue"]),
      }),
    ).toBeInTheDocument();
  });

  it("caps the dots at `max` and shows a +N overflow chip", () => {
    const many = ["Black", "White", "Blue", "Red", "Green", "Silver"].map((c) =>
      color(c),
    );

    renderWithProviders(<ColorDots colors={many} max={5} />);

    expect(
      screen.getByText(dict.productCard.moreColors(1)),
    ).toBeInTheDocument();
  });
});
