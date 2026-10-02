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

describe("CartSummary — mobile «До сплати» bar (TASK-864)", () => {
  it("renders ONE checkout link, inside the bar, next to the payable amount", () => {
    renderWithProviders(
      <CartSummary totals={{ ...totals, addonsTotal: "500.00" }} />,
    );

    const links = screen.getAllByRole("link", { name: dict.cart.checkoutAria });
    expect(links).toHaveLength(1);
    const bar = screen.getByTestId("mobile-pay-bar");
    expect(bar).toContainElement(links[0]);
    // Below md the bar is fixed to the bottom edge; from md up it dissolves
    // and the link renders in the card as before.
    expect(bar).toHaveClass("fixed", "bottom-0", "md:contents");
    // 998 + 500 add-ons — the same payable the card prints.
    expect(bar.textContent?.replace(/\s/g, "")).toContain(
      formatMoney("1498.00").replace(/\s/g, ""),
    );
    // A 44px thumb target in the bar.
    expect(links[0]).toHaveClass("h-11", "md:h-13");
  });

  it("carries the blocked CTA into the bar and keeps the reason readable", () => {
    renderWithProviders(<CartSummary totals={totals} hasUnavailableItems />);

    const bar = screen.getByTestId("mobile-pay-bar");
    const cta = screen.getByRole("button", { name: dict.cart.checkout });
    expect(bar).toContainElement(cta);
    expect(cta).toBeDisabled();
    // The explanation stays in the card (outside the bar) yet still
    // describes the bar's button.
    expect(bar).not.toContainElement(
      screen.getByText(dict.cart.checkoutBlocked),
    );
    expect(cta).toHaveAccessibleDescription(dict.cart.checkoutBlocked);
  });
});
