"use client";

import type { ComponentType } from "react";
import { Bike, Check, MapPin, Package, Truck } from "lucide-react";
import {
  Controller,
  type Control,
  type UseFormSetValue,
} from "react-hook-form";
import { dict } from "@/shared/config";
import { formatMoney } from "@/shared/lib";
import type { CheckoutFormValues } from "../model/checkout-schema";
import {
  centsToMoney,
  deliveryMethodTitle,
  resolveDeliveryMethod,
  toCents,
  type CheckoutDeliveryMethod,
  type CheckoutDeliveryOptions,
} from "../model/delivery";
import { useDeliveryQuote } from "../model/use-delivery-options";

const ICONS: Record<
  CheckoutDeliveryMethod,
  ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
  // The mockup's icons (CheckoutDelivery.dc.html): a carrier's truck, a place
  // to collect from, a city courier's bike, a parcel sent some other way.
  NOVA_POSHTA: Truck,
  PICKUP: MapPin,
  COURIER: Bike,
  OTHER: Package,
};

interface DeliveryMethodPickerProps {
  control: Control<CheckoutFormValues>;
  setValue: UseFormSetValue<CheckoutFormValues>;
  options: CheckoutDeliveryOptions;
  /** The picked Nova Poshta city — turns the NP line into a real quote. */
  npCityRef?: string;
}

/**
 * The fields a move into or out of Nova Poshta must not carry over. `city` and
 * `deliveryAddress` are shared by every branch, but only the NP autocompletes
 * keep their directory refs in step with the text: a city retyped under
 * «Інша доставка» left the old `npCityRef` behind (back on NP the order went
 * out with one city's name and another's ref and quote), and a free-text
 * address landed in the NP branch field with no `npWarehouseRef`. The city's
 * text stays — without its ref the schema asks to pick it from the list again.
 */
function clearNpCarryOver(setValue: UseFormSetValue<CheckoutFormValues>) {
  const opts = { shouldDirty: true, shouldValidate: false } as const;
  setValue("npCityRef", "", opts);
  setValue("npWarehouseRef", "", opts);
  setValue("deliveryAddress", "", opts);
}

/**
 * DeliveryMethodPicker — the «Спосіб доставки» card (TASK-646,
 * CheckoutDelivery.dc.html). One radio per method the shop switched on, in the
 * API's order; each says what it costs before the shopper commits to it.
 *
 * Renders nothing when the shop offers a single method (#np-only): a choice of
 * one is not a choice, and the shopper goes straight to the fields.
 *
 * Same visual grammar as the «Оплата» options (`checkout-payment.tsx`): a native
 * radio inside a label, a 38px icon tile, the selected card in a primary border
 * with a 6% tint, the focus ring on the whole card.
 */
export function DeliveryMethodPicker({
  control,
  setValue,
  options,
  npCityRef,
}: DeliveryMethodPickerProps) {
  // The NP line is a real quote once a city is picked — whatever is selected.
  const { quote: npQuote } = useDeliveryQuote({
    method: "NOVA_POSHTA",
    npCityRef,
  });

  if (options.methods.length < 2) return null;

  const subline = (method: CheckoutDeliveryMethod) => {
    switch (method) {
      case "NOVA_POSHTA":
        if (npQuote.kind === "calculating") {
          return dict.checkout.shippingCalculating;
        }
        if (npQuote.kind === "amount" && npQuote.etaDays != null) {
          return dict.checkout.delivery.npQuote(
            centsToMoney(npQuote.cents),
            npQuote.etaDays,
          );
        }
        if (npQuote.kind === "amount") return centsToMoney(npQuote.cents);
        return dict.checkout.delivery.npTariff;
      case "PICKUP":
        return dict.checkout.delivery.free;
      case "COURIER": {
        const { price, freeFrom } = options.courier;
        if (toCents(price) <= 0) return dict.checkout.delivery.free;
        return freeFrom
          ? dict.checkout.delivery.courierTerms(
              formatMoney(price),
              formatMoney(freeFrom),
            )
          : formatMoney(price);
      }
      case "OTHER":
      default:
        return dict.checkout.delivery.operatorQuotes;
    }
  };

  const isFree = (method: CheckoutDeliveryMethod) =>
    method === "PICKUP" ||
    (method === "COURIER" && toCents(options.courier.price) <= 0);

  return (
    <section className="rounded-card border border-border bg-card p-6 shadow-card">
      <Controller
        name="deliveryMethod"
        control={control}
        render={({ field }) => {
          const selected = resolveDeliveryMethod(field.value, options.methods);
          return (
            <fieldset className="border-0 p-0">
              <legend
                id="checkout-delivery-method-legend"
                className="mb-4 font-display text-lg font-bold text-foreground"
              >
                {dict.checkout.delivery.methodHeading}
              </legend>
              <div
                role="radiogroup"
                aria-labelledby="checkout-delivery-method-legend"
                className="grid gap-2.5 sm:grid-cols-2"
              >
                {options.methods.map((method, index) => {
                  const Icon = ICONS[method];
                  const id = `checkout-delivery-${method.toLowerCase()}`;
                  const noteId = `${id}-note`;
                  const checked = selected === method;
                  return (
                    <label
                      key={method}
                      htmlFor={id}
                      className={[
                        "flex cursor-pointer items-center gap-3.5 rounded-xl border-[1.5px] p-4 transition-colors",
                        "has-focus-visible:ring-2 has-focus-visible:ring-ring",
                        checked
                          ? "border-primary bg-primary/6"
                          : "border-border hover:border-primary/60",
                      ].join(" ")}
                    >
                      <input
                        id={id}
                        type="radio"
                        className="size-4 shrink-0 accent-primary"
                        name={field.name}
                        value={method}
                        checked={checked}
                        aria-describedby={noteId}
                        // RHF focuses the first radio on a blocked submit.
                        ref={index === 0 ? field.ref : undefined}
                        onBlur={field.onBlur}
                        onChange={() => {
                          if (
                            method !== selected &&
                            (method === "NOVA_POSHTA" ||
                              selected === "NOVA_POSHTA")
                          ) {
                            clearNpCarryOver(setValue);
                          }
                          field.onChange(method);
                        }}
                      />
                      <span className="inline-flex size-9.5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className="block text-sm text-foreground">
                          {deliveryMethodTitle(
                            method,
                            options.courier.cityName,
                          )}
                        </b>
                        {/* «Безкоштовно» is green in the mockup; green text
                            at 12px is ≈3.3:1 on white (design-system §2), so
                            the colour rides on the tick and the word stays
                            foreground. */}
                        <span
                          id={noteId}
                          className={
                            isFree(method)
                              ? "inline-flex items-center gap-1 text-xs font-semibold text-foreground"
                              : "text-xs text-muted-foreground"
                          }
                        >
                          {isFree(method) && (
                            <Check
                              className="size-3.5 text-success"
                              aria-hidden
                            />
                          )}
                          {subline(method)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        }}
      />
    </section>
  );
}
