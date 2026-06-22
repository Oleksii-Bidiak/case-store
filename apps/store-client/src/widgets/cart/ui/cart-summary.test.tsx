import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { formatMoney } from "@/shared/lib";
import type { CartTotals } from "@/entities/cart";
import { CartSummary } from "./cart-summary";

const totals: CartTotals = { subtotal: "998.00", itemCount: 2, uniqueItems: 1 };

describe("CartSummary", () => {
  it("renders the subtotal, total, and a checkout link", () => {
    renderWithProviders(<CartSummary totals={totals} />);

    // Subtotal and total both render the formatted subtotal in the MVP. Compare
    // on whitespace-stripped text — Intl (uk-UA) uses a narrow no-break space.
    const stripped = formatMoney("998.00").replace(/\s/g, "");
    const amounts = screen.getAllByText(
      (_, el) => el?.textContent?.replace(/\s/g, "") === stripped,
    );
    expect(amounts.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(dict.cart.itemsCount(2))).toBeInTheDocument();

    const checkoutLink = screen.getByRole("link", {
      name: dict.cart.checkoutAria,
    });
    expect(checkoutLink).toHaveAttribute("href", "/checkout");
  });

  it("clears the cart after confirming the dialog", async () => {
    const user = userEvent.setup();
    let cleared = false;
    server.use(
      http.delete("*/api/cart", () => {
        cleared = true;
        return HttpResponse.json({ data: {} });
      }),
    );

    renderWithProviders(<CartSummary totals={totals} />);

    // Open the confirm dialog, then confirm.
    await user.click(screen.getByRole("button", { name: dict.cart.clear }));
    const confirm = await screen.findByRole("button", {
      name: dict.cart.clearConfirmAction,
    });
    await user.click(confirm);

    await waitFor(() => expect(cleared).toBe(true));
  });
});
