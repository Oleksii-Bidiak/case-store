import { renderWithProviders, screen } from "@/shared/test/render";
import { makeOrder } from "@/shared/test/msw-handlers";
import { dict } from "@/shared/config";
import { formatMoney } from "@/shared/lib";
import { CheckoutGuestSuccess } from "./checkout-guest-success";

const d = dict.checkout.guest;
const order = makeOrder({ id: "94f5f971-aaaa-bbbb-cccc-000000000001" }).data;
const email = "guest@example.com";

/** Compare money on whitespace-stripped text: Intl (uk-UA) puts a narrow
 *  no-break space inside the amount. */
const byStrippedText = (expected: string) => (_: string, el: Element | null) =>
  el?.textContent?.replace(/\s/g, "") === expected.replace(/\s/g, "");

/**
 * TASK-610 — the one screen a guest sees exactly once. It is the only place the
 * shopper learns where the durable copy of the order link went, so every line
 * on it is load-bearing.
 */
describe("CheckoutGuestSuccess (TASK-610)", () => {
  it("names the order by its short number and shows the total", () => {
    renderWithProviders(<CheckoutGuestSuccess order={order} email={email} />);

    expect(
      screen.getByRole("heading", { name: d.successHeading }),
    ).toBeInTheDocument();
    expect(screen.getByText("#94F5F971")).toBeInTheDocument();
    expect(screen.getByText(d.successTotal)).toBeInTheDocument();
    expect(
      screen.getAllByText(byStrippedText(formatMoney(order.total))).length,
    ).toBeGreaterThan(0);
  });

  it("says which address the letter — the durable copy of the link — went to", () => {
    renderWithProviders(<CheckoutGuestSuccess order={order} email={email} />);

    expect(screen.getByText(d.successEmail(email))).toBeInTheDocument();
  });

  it("marks the checkout as finished: step 3 is the current step", () => {
    const { container } = renderWithProviders(
      <CheckoutGuestSuccess order={order} email={email} />,
    );

    const current = container.querySelectorAll('[aria-current="step"]');
    expect(current).toHaveLength(1);
    expect(current[0].closest("li")).toHaveTextContent(
      dict.checkout.stepConfirm,
    );
    // TASK-1098: the last step reads «Готово».
    expect(current[0].closest("li")).toHaveTextContent("Готово");
  });

  it("shows no alert when the payment handoff went fine", () => {
    renderWithProviders(<CheckoutGuestSuccess order={order} email={email} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("announces a failed payment handoff as an alert, keeping the order details", () => {
    const message = "Не вдалося перейти до оплати.";

    renderWithProviders(
      <CheckoutGuestSuccess
        order={order}
        email={email}
        handoffMessage={message}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByText("#94F5F971")).toBeInTheDocument();
    expect(screen.getByText(d.successEmail(email))).toBeInTheDocument();
  });

  it("offers an account as an option, linking to /register", () => {
    renderWithProviders(<CheckoutGuestSuccess order={order} email={email} />);

    expect(
      screen.getByRole("link", { name: d.accountOfferCta }),
    ).toHaveAttribute("href", "/register");
    expect(
      screen.getByRole("link", { name: dict.common.continueShopping }),
    ).toHaveAttribute("href", "/");
  });
});
