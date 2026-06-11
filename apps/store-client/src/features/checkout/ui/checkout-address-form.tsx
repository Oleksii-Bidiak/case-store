"use client";

import type { UseFormRegister, FieldErrors } from "react-hook-form";
import type { AddressDto } from "@/entities/order";
import type { CheckoutFormValues } from "../model/checkout-schema";

const fieldClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type AddressFieldName = keyof AddressDto;

interface AddressFieldConfig {
  name: AddressFieldName;
  label: string;
  required: boolean;
  autoComplete: string;
  maxLength?: number;
  placeholder?: string;
}

const ADDRESS_FIELDS: AddressFieldConfig[] = [
  {
    name: "firstName",
    label: "First name",
    required: true,
    autoComplete: "given-name",
  },
  {
    name: "lastName",
    label: "Last name",
    required: true,
    autoComplete: "family-name",
  },
  {
    name: "company",
    label: "Company",
    required: false,
    autoComplete: "organization",
  },
  {
    name: "address1",
    label: "Address line 1",
    required: true,
    autoComplete: "address-line1",
  },
  {
    name: "address2",
    label: "Address line 2",
    required: false,
    autoComplete: "address-line2",
  },
  {
    name: "city",
    label: "City",
    required: true,
    autoComplete: "address-level2",
  },
  {
    name: "state",
    label: "State / region",
    required: false,
    autoComplete: "address-level1",
  },
  {
    name: "postalCode",
    label: "Postal code",
    required: true,
    autoComplete: "postal-code",
  },
  {
    name: "country",
    label: "Country",
    required: true,
    autoComplete: "country",
    maxLength: 2,
    placeholder: "e.g. UA",
  },
  { name: "phone", label: "Phone", required: false, autoComplete: "tel" },
];

interface CheckoutAddressFormProps {
  prefix: "shippingAddress" | "billingAddress";
  legend: string;
  register: UseFormRegister<CheckoutFormValues>;
  errors: FieldErrors<CheckoutFormValues>;
}

/**
 * CheckoutAddressForm — a reusable address fieldset for the checkout form.
 * The `prefix` scopes every field name (`shippingAddress.*` or `billingAddress.*`)
 * so the same component renders both the shipping and billing sections without
 * DOM id collisions.
 */
export function CheckoutAddressForm({
  prefix,
  legend,
  register,
  errors,
}: CheckoutAddressFormProps) {
  const fieldErrors = errors[prefix];

  return (
    <fieldset className="flex flex-col gap-4 border-0 p-0">
      <legend className="mb-2 text-lg font-semibold text-foreground">
        {legend}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {ADDRESS_FIELDS.map((field) => {
          const id = `${prefix}-${field.name}`;
          const message = fieldErrors?.[field.name]?.message;
          return (
            <div key={field.name} className="flex flex-col gap-1">
              <label
                htmlFor={id}
                className="text-sm font-medium text-foreground"
              >
                {field.label}
                {!field.required && (
                  <span className="text-muted-foreground"> (optional)</span>
                )}
              </label>
              <input
                id={id}
                autoComplete={field.autoComplete}
                maxLength={field.maxLength}
                placeholder={field.placeholder}
                className={fieldClass}
                {...register(`${prefix}.${field.name}`)}
              />
              {message && (
                <p role="alert" className="text-sm text-destructive">
                  {message}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
