"use client";

import {
  Controller,
  type Control,
  type UseFormRegister,
  type FieldErrors,
} from "react-hook-form";
import { dict } from "@/shared/config";
import { Input, Label, PhoneInput } from "@/shared/ui";
import type { CheckoutFormValues } from "../model/checkout-schema";

interface FieldConfig {
  name: keyof CheckoutFormValues;
  label: string;
  autoComplete: string;
  type?: string;
  placeholder?: string;
  /** Render full-width (own row) instead of half-width in the grid. */
  fullWidth?: boolean;
  maxLength?: number;
}

/**
 * Simplified Ukrainian checkout fields (manual delivery — Nova Poshta API is a
 * future integration, TASK-080). All fields below are required; `notes` lives
 * in the parent form. `deliveryAddress` is a single free-text field that maps to
 * the backend `AddressDto.address1`. The `phone` field sits between these two
 * groups and is rendered via `Controller` + `PhoneInput` (UA mask).
 */
const NAME_FIELDS: FieldConfig[] = [
  {
    name: "firstName",
    label: dict.checkout.fields.firstName,
    autoComplete: "given-name",
  },
  {
    name: "lastName",
    label: dict.checkout.fields.lastName,
    autoComplete: "family-name",
  },
];

const DELIVERY_FIELDS: FieldConfig[] = [
  {
    name: "city",
    label: dict.checkout.fields.city,
    autoComplete: "address-level2",
  },
  {
    name: "deliveryAddress",
    label: dict.checkout.fields.deliveryAddress,
    autoComplete: "street-address",
    placeholder: dict.checkout.deliveryPlaceholder,
    fullWidth: true,
    maxLength: 500,
  },
];

interface CheckoutAddressFormProps {
  legend: string;
  register: UseFormRegister<CheckoutFormValues>;
  control: Control<CheckoutFormValues>;
  errors: FieldErrors<CheckoutFormValues>;
}

/**
 * CheckoutAddressForm — the recipient + delivery fieldset for checkout. Renders
 * the simplified UA field set; the delivery address spans the full row and
 * carries a hint that delivery is arranged manually.
 */
export function CheckoutAddressForm({
  legend,
  register,
  control,
  errors,
}: CheckoutAddressFormProps) {
  const renderField = (field: FieldConfig) => {
    const id = `checkout-${field.name}`;
    const message = errors[field.name]?.message;
    return (
      <div
        key={field.name}
        className={`flex flex-col gap-1.5 ${field.fullWidth ? "sm:col-span-2" : ""}`}
      >
        <Label htmlFor={id}>{field.label}</Label>
        <Input
          id={id}
          type={field.type}
          autoComplete={field.autoComplete}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
          aria-invalid={message ? true : undefined}
          {...register(field.name)}
        />
        {field.name === "deliveryAddress" && !message && (
          <span className="text-xs text-muted-foreground">
            {dict.checkout.deliveryHint}
          </span>
        )}
        {message && (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}
      </div>
    );
  };

  return (
    <fieldset className="flex flex-col gap-4 border-0 p-0">
      <legend className="mb-2 text-lg font-semibold text-foreground">
        {legend}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {NAME_FIELDS.map(renderField)}

        <Controller
          name="phone"
          control={control}
          render={({ field, fieldState }) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="checkout-phone">
                {dict.checkout.fields.phone}
              </Label>
              <PhoneInput
                id="checkout-phone"
                autoComplete="tel"
                placeholder={dict.checkout.phonePlaceholder}
                aria-invalid={fieldState.error ? true : undefined}
                {...field}
              />
              {fieldState.error && (
                <p role="alert" className="text-sm text-destructive">
                  {fieldState.error.message}
                </p>
              )}
            </div>
          )}
        />

        {DELIVERY_FIELDS.map(renderField)}
      </div>
    </fieldset>
  );
}
