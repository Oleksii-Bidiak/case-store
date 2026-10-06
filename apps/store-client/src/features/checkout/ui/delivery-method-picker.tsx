"use client";

import type { ComponentType } from "react";
import { Check, CircleHelp, Package, Store, Truck } from "lucide-react";
import { Controller, type Control } from "react-hook-form";
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
  NOVA_POSHTA: Package,
  PICKUP: Store,
  COURIER: Truck,
  OTHER: CircleHelp,
};

interface DeliveryMethodPickerProps {
  control: Control<CheckoutFormValues>;
  options: CheckoutDeliveryOptions;
  /** The picked Nova Poshta city — turns the NP line into a real quote. */
  npCityRef?: string;
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
                        onChange={() => field.onChange(method)}
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
