import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { makeCart, makeCartItem } from "@/shared/test/msw-handlers";
import { dict } from "@/shared/config";
import { CartView } from "./cart-view";

/**
 * Regression tests for the TASK-118 reload bug: CartView must not fetch the cart
 * while AuthProvider is still running its mount-time refresh. Firing early would
 * request the cart as a guest and cache an empty cart as the user's.
 */
describe("CartView — auth bootstrap guard (TASK-118)", () => {
  it("does not request the cart while auth is initializing", async () => {
    let cartRequests = 0;
    server.use(
      http.get("*/api/cart", () => {
        cartRequests += 1;
        return HttpResponse.json(makeCart());
      }),
    );

    renderWithProviders(<CartView />, { auth: { isInitializing: true } });

    // The loading skeleton is shown — no cart content, no empty state.
    expect(screen.queryByText(dict.cart.title)).not.toBeInTheDocument();
    expect(screen.queryByText(dict.cart.emptyHeading)).not.toBeInTheDocument();

    // Give an (erroneously) enabled query time to fire, then assert none did.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(cartRequests).toBe(0);
  });

  it("fetches and renders the cart once auth initialization completes", async () => {
    server.use(
      http.get("*/api/cart", () =>
        HttpResponse.json(
          makeCart([makeCartItem({ productName: "Merged Cable" })]),
        ),
      ),
    );

    renderWithProviders(<CartView />, { auth: { isInitializing: false } });

    expect(await screen.findByText("Merged Cable")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(dict.cart.summaryTitle)).toBeInTheDocument(),
    );
  });
});
