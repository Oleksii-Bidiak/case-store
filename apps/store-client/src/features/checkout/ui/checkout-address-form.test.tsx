import type { UseFormRegister, FieldErrors } from "react-hook-form";
import { render, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import type { CheckoutFormValues } from "../model/checkout-schema";
import { CheckoutAddressForm } from "./checkout-address-form";

/** Minimal register stub — returns the field props shape RHF would. */
const register = ((name: string) => ({
  name,
  onChange: jest.fn(),
  onBlur: jest.fn(),
  ref: jest.fn(),
})) as unknown as UseFormRegister<CheckoutFormValues>;

function renderForm(errors: FieldErrors<CheckoutFormValues> = {}) {
  return render(
    <CheckoutAddressForm
      legend="Доставка"
      register={register}
      errors={errors}
    />,
  );
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

  it("shows the delivery hint when deliveryAddress has no error", () => {
    renderForm();

    expect(screen.getByText(dict.checkout.deliveryHint)).toBeInTheDocument();
  });

  it("marks a field invalid and surfaces its error message", () => {
    renderForm({ phone: { type: "manual", message: "Невірний телефон" } });

    expect(screen.getByLabelText(dict.checkout.fields.phone)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Невірний телефон");
  });

  it("replaces the delivery hint with the error when deliveryAddress is invalid", () => {
    renderForm({
      deliveryAddress: { type: "manual", message: "Вкажіть адресу" },
    });

    expect(
      screen.queryByText(dict.checkout.deliveryHint),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Вкажіть адресу");
  });
});
