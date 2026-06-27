import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { render, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import type { CheckoutFormValues } from "../model/checkout-schema";
import { CheckoutAddressForm } from "./checkout-address-form";

/**
 * Render the form inside a real `useForm` instance. The phone field now uses
 * `Controller`, which needs a genuine `control` object (the old `register` stub
 * is no longer sufficient). Errors are injected via `setError` so they flow
 * through both `formState.errors` (register fields) and `fieldState` (phone).
 */
function renderForm(
  errors: Partial<Record<keyof CheckoutFormValues, string>> = {},
) {
  function Harness() {
    const form = useForm<CheckoutFormValues>({
      defaultValues: {
        firstName: "",
        lastName: "",
        phone: "",
        city: "",
        deliveryAddress: "",
        notes: "",
      },
    });

    useEffect(() => {
      Object.entries(errors).forEach(([name, message]) => {
        form.setError(name as keyof CheckoutFormValues, {
          type: "manual",
          message,
        });
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <CheckoutAddressForm
        legend="Доставка"
        register={form.register}
        control={form.control}
        errors={form.formState.errors}
      />
    );
  }

  return render(<Harness />);
}

describe("CheckoutAddressForm", () => {
  it("renders all required UA delivery fields", () => {
    renderForm();

    expect(
      screen.getByLabelText(dict.checkout.fields.firstName),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(dict.checkout.fields.lastName),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(dict.checkout.fields.phone),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(dict.checkout.fields.city),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(dict.checkout.fields.deliveryAddress),
    ).toBeInTheDocument();
  });

  it("renders the phone field with type=tel and inputMode=numeric", () => {
    renderForm();

    const phone = screen.getByLabelText(dict.checkout.fields.phone);
    expect(phone).toHaveAttribute("type", "tel");
    expect(phone).toHaveAttribute("inputmode", "numeric");
  });

  it("shows the delivery hint when deliveryAddress has no error", () => {
    renderForm();

    expect(screen.getByText(dict.checkout.deliveryHint)).toBeInTheDocument();
  });

  it("marks a field invalid and surfaces its error message", () => {
    renderForm({ phone: "Невірний телефон" });

    expect(screen.getByLabelText(dict.checkout.fields.phone)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Невірний телефон");
  });

  it("replaces the delivery hint with the error when deliveryAddress is invalid", () => {
    renderForm({ deliveryAddress: "Вкажіть адресу" });

    expect(
      screen.queryByText(dict.checkout.deliveryHint),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Вкажіть адресу");
  });
});
