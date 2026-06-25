import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import type { ProductGroupEntity } from "@/entities/product";
import { ProductSiblingNavigator } from "./product-sibling-navigator";

// next/navigation is unavailable under jsdom — mock the router.
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

/**
 * Group with two axes (color, pack) and three positions:
 *   blue/single, blue/double, indigo/single — indigo/double is absent (a gap).
 */
function makeGroup(): ProductGroupEntity {
  const sibling = (
    id: string,
    slug: string,
    color: string,
    pack: string,
    order: number,
  ) => ({
    id,
    slug,
    name: `${color} ${pack}`,
    price: "9.99",
    attributes: { color, pack },
    stock: 5,
    isActive: true,
    positionOrder: order,
  });

  return {
    id: "g1",
    name: "Tempered Glass",
    axes: [
      { name: "color", sortOrder: 0 },
      { name: "pack", sortOrder: 1 },
    ],
    positions: [
      sibling("p1", "glass-blue-single", "blue", "single", 0),
      sibling("p2", "glass-blue-double", "blue", "double", 1),
      sibling("p3", "glass-indigo-single", "indigo", "single", 2),
    ],
  };
}

describe("ProductSiblingNavigator", () => {
  beforeEach(() => mockPush.mockClear());

  it("renders one strip per axis and marks the current value active", () => {
    renderWithProviders(
      <ProductSiblingNavigator
        group={makeGroup()}
        currentAttributes={{ color: "blue", pack: "single" }}
        currentSlug="glass-blue-single"
      />,
    );

    // The current position's values are pressed.
    expect(screen.getByRole("button", { name: "blue" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "single" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("navigates to the sibling matching the other axes when a value is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ProductSiblingNavigator
        group={makeGroup()}
        currentAttributes={{ color: "blue", pack: "single" }}
        currentSlug="glass-blue-single"
      />,
    );

    // Switching pack single→double keeps color=blue → blue/double position.
    await user.click(screen.getByRole("button", { name: "double" }));
    expect(mockPush).toHaveBeenCalledWith("/products/glass-blue-double");

    // Switching color blue→indigo keeps pack=single → indigo/single position.
    await user.click(screen.getByRole("button", { name: "indigo" }));
    expect(mockPush).toHaveBeenCalledWith("/products/glass-indigo-single");
  });

  it("disables a value with no resolvable sibling (data gap)", () => {
    renderWithProviders(
      <ProductSiblingNavigator
        group={makeGroup()}
        currentAttributes={{ color: "indigo", pack: "single" }}
        currentSlug="glass-indigo-single"
      />,
    );

    // indigo/double does not exist → the "double" value is disabled.
    expect(screen.getByRole("button", { name: "double" })).toBeDisabled();
  });
});
