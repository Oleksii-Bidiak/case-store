"use client";

import {
  Controller,
  useWatch,
  type Control,
  type UseFormRegister,
  type UseFormSetValue,
  type FieldErrors,
} from "react-hook-form";
import { dict } from "@/shared/config";
import { Input, Label, PhoneInput } from "@/shared/ui";
import type { CheckoutFormValues } from "../model/checkout-schema";
import { NpCityField } from "./np-city-field";
import { NpWarehouseField } from "./np-warehouse-field";

interface FieldConfig {
  name: keyof CheckoutFormValues;
  label: string;
  autoComplete: string;
  type?: string;
}

/**
 * Recipient name fields (rendered via plain `register`). Phone is a `Controller`
 * + `PhoneInput`; the city/warehouse rows use the Nova Poshta autocomplete
 * (`NpCityField` / `NpWarehouseField`, TASK-080), which fall back to free text
 * when NP is offline so manual delivery still works.
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

interface CheckoutAddressFormProps {
  legend: string;
  register: UseFormRegister<CheckoutFormValues>;
  control: Control<CheckoutFormValues>;
  setValue: UseFormSetValue<CheckoutFormValues>;
  errors: FieldErrors<CheckoutFormValues>;
}

/**
 * CheckoutAddressForm — the recipient + delivery fieldset for checkout. The
 * delivery rows are Nova Poshta autocompletes: the warehouse search is scoped to
 * the city selected via `npCityRef` (watched here and passed down).
 */
export function CheckoutAddressForm({
  legend,
  register,
  control,
  setValue,
  errors,
}: CheckoutAddressFormProps) {
  const npCityRef = useWatch({ control, name: "npCityRef" });

  const renderField = (field: FieldConfig) => {
    const id = `checkout-${field.name}`;
    const message = errors[field.name]?.message;
    return (
      <div key={field.name} className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{field.label}</Label>
        <Input
          id={id}
          type={field.type}
          autoComplete={field.autoComplete}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? `${id}-error` : undefined}
          {...register(field.name)}
        />
        {message && (
          <p
            id={`${id}-error`}
            role="alert"
            className="text-sm text-destructive"
          >
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
                aria-describedby={
                  fieldState.error
                    ? "checkout-phone-error"
                    : "checkout-phone-hint"
                }
                {...field}
              />
              {fieldState.error ? (
                <p
                  id="checkout-phone-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {fieldState.error.message}
                </p>
              ) : (
                // Stated up front (TASK-407): "Вкажіть коректний номер
                // телефону" tells a shopper that something is wrong, never what.
                <p
                  id="checkout-phone-hint"
                  className="text-xs text-muted-foreground"
                >
                  {dict.checkout.phoneHint}
                </p>
              )}
            </div>
          )}
        />

        <NpCityField control={control} setValue={setValue} />
        <NpWarehouseField
          control={control}
          setValue={setValue}
          cityRef={npCityRef}
        />
      </div>
    </fieldset>
  );
}
