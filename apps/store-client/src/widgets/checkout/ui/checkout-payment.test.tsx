import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { CheckoutPayment } from "./checkout-payment";

describe("CheckoutPayment", () => {
  it("states the single real payment method and that a manager will call", () => {
    renderWithProviders(<CheckoutPayment />);

    expect(
      screen.getByText(dict.checkout.paymentMethodTitle),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.checkout.paymentManagerNote),
    ).toBeInTheDocument();
  });

  // Regression guard. This section used to render a radio group whose "Картка
  // онлайн" option was never sent to the API — the order was created as PENDING
  // regardless, so a customer who chose it was told their card payment had
  // succeeded when no payment existed. Until a payment provider is actually
  // wired up (TASK-034), offering any choice here is a lie, so assert there is
  // none: no radios, and no card/online-payment wording.
  it("offers no payment choice while there is no payment provider", () => {
    renderWithProviders(<CheckoutPayment />);

    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/Картка онлайн/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Visa|Mastercard|Apple Pay|Google Pay/i),
    ).not.toBeInTheDocument();
  });
});
