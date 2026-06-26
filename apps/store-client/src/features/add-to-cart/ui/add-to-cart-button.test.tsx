import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { AddToCartButton } from "./add-to-cart-button";

describe("AddToCartButton — out-of-stock guard (TASK-144)", () => {
  it("renders a disabled compact button labelled 'Немає в наявності' when out of stock", () => {
    renderWithProviders(<AddToCartButton productId="p1" compact outOfStock />);

    const button = screen.getByRole("button", {
      name: dict.addToCart.outOfStock,
    });
    expect(button).toBeDisabled();
  });

  it("renders an enabled compact button labelled 'Додати до кошика' when in stock", () => {
    renderWithProviders(
      <AddToCartButton productId="p1" compact outOfStock={false} />,
    );

    const button = screen.getByRole("button", { name: dict.addToCart.idle });
    expect(button).toBeEnabled();
  });
});
