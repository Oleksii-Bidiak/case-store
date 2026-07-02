import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { formatMoney } from "@/shared/lib";
import type { CartTotals } from "@/entities/cart";
import { CartSummary } from "./cart-summary";

const totals: CartTotals = { subtotal: "998.00", itemCount: 2, uniqueItems: 1 };

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

  it("adds selected add-on services (stub) to the payable total", () => {
    renderWithProviders(<CartSummary totals={totals} servicesTotal={500} />);

    expect(screen.getByText(dict.cart.addonServicesLine)).toBeInTheDocument();
    // subtotal 998 + services 500 = 1498.
    const expected = formatMoney("1498.00").replace(/\s/g, "");
    expect(
      screen.getAllByText(
        (_, el) => el?.textContent?.replace(/\s/g, "") === expected,
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });
});
