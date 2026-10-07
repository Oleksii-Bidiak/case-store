import { useForm } from "react-hook-form";
import { renderWithProviders, screen } from "@/shared/test/render";
import {
  resolvePaymentMethods,
  CHECKOUT_DEFAULT_VALUES,
  type CheckoutFormValues,
  type PaymentMethodOption,
} from "@/features/checkout";
import { dict } from "@/shared/config";
import { CheckoutPayment } from "./checkout-payment";

/** Host component supplying the RHF control the section binds to. */
function Harness({ options }: { options: PaymentMethodOption[] }) {
  const { control } = useForm<CheckoutFormValues>({
    defaultValues: CHECKOUT_DEFAULT_VALUES,
  });
  return <CheckoutPayment control={control} options={options} />;
}

const authedOptions = resolvePaymentMethods({
  configured: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
  isAuthenticated: true,
});

describe("CheckoutPayment (TASK-330-B)", () => {
  it("renders one radio per offered method inside a labelled radiogroup", () => {
    renderWithProviders(<Harness options={authedOptions} />);

    expect(
      screen.getByRole("radiogroup", { name: dict.checkout.payment.groupAria }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(
      screen.getByRole("radio", { name: /Оплата при отриманні/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /Картка онлайн/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /Оплата частинами/ }),
    ).toBeInTheDocument();
  });

  it("preselects cash on delivery — the backend's own column default", () => {
    renderWithProviders(<Harness options={authedOptions} />);

    expect(
      screen.getByRole("radio", { name: /Оплата при отриманні/ }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: /Картка онлайн/ }),
    ).not.toBeChecked();
  });

  it("offers only what the deployment configured", () => {
    // Default deployment: no merchant keys, so no card option is drawn at all
    // rather than one that would 503 on submit.
    renderWithProviders(
      <Harness
        options={resolvePaymentMethods({
          configured: ["ON_DELIVERY"],
          isAuthenticated: true,
        })}
      />,
    );

    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(screen.queryByText(/Картка онлайн/)).not.toBeInTheDocument();
  });

  it("hides instalments when the bank agreement is not switched on", () => {
    renderWithProviders(
      <Harness
        options={resolvePaymentMethods({
          configured: ["ON_DELIVERY", "ONLINE"],
          isAuthenticated: true,
        })}
      />,
    );

    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.queryByText(/Оплата частинами/)).not.toBeInTheDocument();
  });

  /**
   * Regression guard, inverted from its previous form. The old assertion here
   * was "there must be no choice at all", because the choice then on offer
   * reached nothing: a shopper who picked "Картка онлайн" saw the order succeed
   * and reasonably believed they had paid. The choice is allowed back only under
   * the condition that replaced it — an option this shopper cannot carry through
   * must be visibly unavailable, never clickable-but-inert.
   */
  it("disables an option the shopper cannot complete, and says why", () => {
    renderWithProviders(
      <Harness
        options={resolvePaymentMethods({
          configured: ["ON_DELIVERY", "ONLINE"],
          isAuthenticated: false,
        })}
      />,
    );

    expect(screen.getByRole("radio", { name: /Картка онлайн/ })).toBeDisabled();
    expect(
      screen.getByText(dict.checkout.payment.accountRequired),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: dict.checkout.payment.signIn }),
    ).toHaveAttribute("href", "/login?redirect=/checkout");

    // Cash on delivery stays usable — guest checkout itself is not gated.
    expect(
      screen.getByRole("radio", { name: /Оплата при отриманні/ }),
    ).toBeEnabled();
  });

  // TASK-646: the delivery × payment matrix.
  it("disables a method the delivery rules out with the delivery reason, and no sign-in link", () => {
    renderWithProviders(
      <Harness
        options={resolvePaymentMethods({
          configured: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
          isAuthenticated: false,
          delivery: {
            method: "OTHER",
            matrix: {
              NOVA_POSHTA: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
              PICKUP: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
              COURIER: ["ON_DELIVERY", "ONLINE", "INSTALLMENTS"],
              OTHER: ["ON_DELIVERY"],
            },
          },
        })}
      />,
    );

    for (const name of [/Картка онлайн/, /Оплата частинами/]) {
      const radio = screen.getByRole("radio", { name });
      expect(radio).toBeDisabled();
      expect(radio).toHaveAccessibleDescription(
        dict.checkout.delivery.paymentBlockedOther,
      );
    }
    // The reason is the one thing to read on a disabled option: nothing
    // between it and the card fades it below AA contrast.
    for (const reason of screen.getAllByText(
      dict.checkout.delivery.paymentBlockedOther,
    )) {
      expect(reason.closest(".opacity-60")).toBeNull();
    }
    expect(
      screen.queryByRole("link", { name: dict.checkout.payment.signIn }),
    ).toBeNull();
    expect(
      screen.getByRole("radio", { name: /Оплата при отриманні/ }),
    ).toHaveAccessibleDescription(dict.checkout.delivery.onDeliveryNote.OTHER);
  });
});
