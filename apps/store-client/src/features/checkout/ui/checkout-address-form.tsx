"use client";

import { useState } from "react";
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
import {
  FALLBACK_DELIVERY_OPTIONS,
  type CheckoutDeliveryMethod,
  type CheckoutDeliveryOptions,
} from "../model/delivery";
import { NpCityField } from "./np-city-field";
import { NpWarehouseField } from "./np-warehouse-field";
import {
  CourierBranch,
  DeliveryBranch,
  NpManualBranch,
  OtherBranch,
  PickupBranch,
} from "./delivery-branch-fields";

interface FieldConfig {
  name: keyof CheckoutFormValues;
  label: string;
  autoComplete: string;
  type?: string;
}

/**
 * Recipient name fields (rendered via plain `register`). Phone is a `Controller`
 * + `PhoneInput`; what follows depends on the delivery method (TASK-646).
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
  /**
   * The delivery method whose fields to draw — already resolved against the
   * shop's list (the form value can lag one render behind it). Defaults to Nova
   * Poshta, the checkout this form grew out of.
   */
  method?: CheckoutDeliveryMethod;
  /** The shop's delivery offer: pickup points, the courier's terms. */
  options?: CheckoutDeliveryOptions;
}

/**
 * CheckoutAddressForm — the «Отримувач» card of checkout step 1: who receives
 * the parcel (name, phone), then a subsection for WHERE, by delivery method
 * (CheckoutDelivery.dc.html):
 *
 *   - Nova Poshta — the city and branch autocompletes (TASK-080). When the city
 *     lookup itself fails, the subsection turns into the manual path
 *     (`npManual`, TASK-1097): typed city + address, booked by the server as
 *     «інша доставка».
 *   - Pickup / courier / other — `delivery-branch-fields.tsx`.
 */
export function CheckoutAddressForm({
  legend,
  register,
  control,
  setValue,
  errors,
  method = "NOVA_POSHTA",
  options = FALLBACK_DELIVERY_OPTIONS,
}: CheckoutAddressFormProps) {
  const npCityRef = useWatch({ control, name: "npCityRef" });
  const npManual = useWatch({ control, name: "npManual" }) ?? false;
  // Whether the manual city input should take focus when it replaces the
  // autocomplete — only if the shopper was typing there at that moment.
  const [focusManualCity, setFocusManualCity] = useState(false);

  const switchToManual = () => {
    setFocusManualCity(document.activeElement?.id === "checkout-city");
    // Dirty on purpose: the profile prefill resets every pristine field, and
    // must not put the dead autocomplete back.
    setValue("npManual", true, { shouldDirty: true, shouldValidate: false });
    setValue("npCityRef", "");
    setValue("npWarehouseRef", "");
  };

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

  const branch = () => {
    switch (method) {
      case "PICKUP":
        return <PickupBranch control={control} points={options.pickupPoints} />;
      case "COURIER":
        return (
          <CourierBranch
            register={register}
            errors={errors}
            courier={options.courier}
          />
        );
      case "OTHER":
        return <OtherBranch register={register} errors={errors} />;
      case "NOVA_POSHTA":
      default:
        if (npManual) {
          return (
            <NpManualBranch
              register={register}
              errors={errors}
              focusCity={focusManualCity}
            />
          );
        }
        return (
          <DeliveryBranch heading={dict.checkout.delivery.npHeading}>
            <div className="grid gap-4 sm:grid-cols-2">
              <NpCityField
                control={control}
                setValue={setValue}
                onLookupError={switchToManual}
              />
              <NpWarehouseField
                control={control}
                setValue={setValue}
                cityRef={npCityRef}
              />
            </div>
          </DeliveryBranch>
        );
    }
  };

  return (
    <fieldset className="flex flex-col gap-5 border-0 p-0">
      <legend className="mb-2 font-display text-lg font-bold text-foreground">
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
      </div>

      {branch()}
    </fieldset>
  );
}
