import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { formatMoney } from "@/shared/lib";
import type { CartTotals } from "@/entities/cart";
import { CartSummary } from "./cart-summary";

const totals: CartTotals = {
  subtotal: "998.00",
  itemCount: 2,
  uniqueItems: 1,
  addonsTotal: "0.00",
};

describe("CartSummary", () => {
  it("renders the items subtotal, payable total, and a checkout link", () => {
    renderWithProviders(<CartSummary totals={totals} />);

    // With no coupon or services the payable equals the subtotal, so the
    // formatted amount appears twice (items line + "До сплати"). Compare on
    // whitespace-stripped text — Intl (uk-UA) uses a narrow no-break space.
    const stripped = formatMoney("998.00").replace(/\s/g, "");
    const amounts = screen.getAllByText(
      (_, el) => el?.textContent?.replace(/\s/g, "") === stripped,
    );
    expect(amounts.length).toBeGreaterThanOrEqual(2);

    expect(
      screen.getByText(`${dict.cart.itemsLine} (${dict.cart.countShort(2)})`),
    ).toBeInTheDocument();

    const checkoutLink = screen.getByRole("link", {
      name: dict.cart.checkoutAria,
    });
    expect(checkoutLink).toHaveAttribute("href", "/checkout");
  });

  it("adds the server-computed add-on services total to the payable total (TASK-174)", () => {
    renderWithProviders(
      <CartSummary totals={{ ...totals, addonsTotal: "500.00" }} />,
    );

    expect(screen.getByText(dict.cart.addonServicesLine)).toBeInTheDocument();
    // subtotal 998 + add-ons 500 = 1498.
    const expected = formatMoney("1498.00").replace(/\s/g, "");
    expect(
      screen.getAllByText(
        (_, el) => el?.textContent?.replace(/\s/g, "") === expected,
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("omits the add-on line entirely when nothing is selected", () => {
    renderWithProviders(<CartSummary totals={totals} />);

    expect(
      screen.queryByText(dict.cart.addonServicesLine),
    ).not.toBeInTheDocument();
  });

  it("blocks the checkout CTA while a line is withdrawn from sale (TASK-403)", () => {
    renderWithProviders(<CartSummary totals={totals} hasUnavailableItems />);

    // The navigable link is gone — /checkout would only fail on an order the
    // API refuses to create — and what unblocks it is spelled out.
    expect(
      screen.queryByRole("link", { name: dict.cart.checkoutAria }),
    ).not.toBeInTheDocument();
    const cta = screen.getByRole("button", { name: dict.cart.checkout });
    expect(cta).toBeDisabled();
    expect(cta).toHaveAccessibleDescription(dict.cart.checkoutBlocked);
  });
});
