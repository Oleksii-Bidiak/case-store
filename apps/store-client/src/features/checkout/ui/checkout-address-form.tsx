"use client";

import type { UseFormRegister, FieldErrors } from "react-hook-form";
import type { AddressDto } from "@/entities/order";
import { dict } from "@/shared/config";
import { Input, Label } from "@/shared/ui";
import type { CheckoutFormValues } from "../model/checkout-schema";

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
    label: dict.checkout.fields.firstName,
    required: true,
    autoComplete: "given-name",
  },
  {
    name: "lastName",
    label: dict.checkout.fields.lastName,
    required: true,
    autoComplete: "family-name",
  },
  {
    name: "company",
    label: dict.checkout.fields.company,
    required: false,
    autoComplete: "organization",
  },
  {
    name: "address1",
    label: dict.checkout.fields.address1,
    required: true,
    autoComplete: "address-line1",
  },
  {
    name: "address2",
    label: dict.checkout.fields.address2,
    required: false,
    autoComplete: "address-line2",
  },
  {
    name: "city",
    label: dict.checkout.fields.city,
    required: true,
    autoComplete: "address-level2",
  },
  {
    name: "state",
    label: dict.checkout.fields.state,
    required: false,
    autoComplete: "address-level1",
  },
  {
    name: "postalCode",
    label: dict.checkout.fields.postalCode,
    required: true,
    autoComplete: "postal-code",
  },
  {
    name: "country",
    label: dict.checkout.fields.country,
    required: true,
    autoComplete: "country",
    maxLength: 2,
    placeholder: dict.checkout.countryPlaceholder,
  },
  {
    name: "phone",
    label: dict.checkout.fields.phone,
    required: false,
    autoComplete: "tel",
  },
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
            <div key={field.name} className="flex flex-col gap-1.5">
              <Label htmlFor={id}>
                {field.label}
                {!field.required && (
                  <span className="font-normal text-muted-foreground">
                    {dict.common.optional}
                  </span>
                )}
              </Label>
              <Input
                id={id}
                autoComplete={field.autoComplete}
                maxLength={field.maxLength}
                placeholder={field.placeholder}
                aria-invalid={message ? true : undefined}
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
