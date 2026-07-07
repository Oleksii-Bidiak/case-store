import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
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

  it("renders an enabled compact button labelled 'Купити' when in stock", () => {
    renderWithProviders(
      <AddToCartButton productId="p1" compact outOfStock={false} />,
    );

    const button = screen.getByRole("button", { name: dict.addToCart.buy });
    expect(button).toBeEnabled();
  });
});

// TASK-261 — add_to_cart analytics event. Relies on the default MSW handler for
// POST /api/cart/items (201) so the mutation's onSuccess runs.
describe("AddToCartButton — add_to_cart analytics (TASK-261)", () => {
  afterEach(() => {
    delete window.umami;
  });

  it("reports add_to_cart with productId and quantity after a successful add", async () => {
    const track = jest.fn();
    window.umami = { track };
    const user = userEvent.setup();

    renderWithProviders(<AddToCartButton productId="p1" quantity={3} />);
    await user.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(track).toHaveBeenCalledWith("add_to_cart", {
        productId: "p1",
        quantity: 3,
      }),
    );
    expect(
      track.mock.calls.filter(([name]) => name === "add_to_cart"),
    ).toHaveLength(1);
  });
});
