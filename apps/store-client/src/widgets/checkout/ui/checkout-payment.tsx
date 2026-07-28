"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { Banknote, CreditCard, CalendarClock, Phone } from "lucide-react";
import { Controller, type Control } from "react-hook-form";
import type {
  CheckoutFormValues,
  CheckoutPaymentMethod,
  PaymentMethodOption,
} from "@/features/checkout";
import { dict } from "@/shared/config";

interface CheckoutPaymentProps {
  control: Control<CheckoutFormValues>;
  /** Methods this deployment offers, already resolved for this shopper. */
  options: PaymentMethodOption[];
}

const ICONS: Record<
  CheckoutPaymentMethod,
  ComponentType<{ className?: string }>
> = {
  ON_DELIVERY: Banknote,
  ONLINE: CreditCard,
  INSTALLMENTS: CalendarClock,
};

/**
 * CheckoutPayment — the "Оплата" section, and a real choice again (TASK-330-B).
 *
 * ── The history this component is accountable to ──────────────────────────────
 * Two versions ago this was a radio group offering "Картка онлайн · Visa /
 * Mastercard · Apple Pay, Google Pay" that reached nothing: `CreateOrderDto` had
 * no payment field, every order was created `PENDING` for a manager to settle by
 * phone, and a shopper who picked card watched their order succeed and reasonably
 * concluded they had paid. One version ago it was replaced by a single honest
 * statement, on the grounds that a choice which cannot be honoured is worse than
 * no choice at all.
 *
 * The choice returns now — and only now — because every option has somewhere real
 * to go. `ON_DELIVERY` is the backend's own column default, so what the shopper
 * picks and what gets stored agree. `ONLINE` / `INSTALLMENTS` make `useCheckout`
 * open a genuine payment attempt via `POST /api/payments/orders/:id/checkout` and
 * hand the browser to the provider's page. An option that cannot be carried
 * through for *this* shopper is drawn disabled with the reason attached
 * ({@link PaymentMethodOption.blockedBy}) instead of quietly swallowing a click.
 *
 * Which options exist at all is decided by `resolvePaymentMethods`, not here.
 * This component only draws what it is handed.
 */
export function CheckoutPayment({ control, options }: CheckoutPaymentProps) {
  return (
    <section className="rounded-[18px] border border-border bg-card p-6 shadow-card">
      <h2 className="mb-4 font-display text-lg font-bold text-foreground">
        {dict.checkout.paymentHeading}
      </h2>

      <Controller
        name="paymentMethod"
        control={control}
        render={({ field }) => (
          <div
            role="radiogroup"
            aria-label={dict.checkout.payment.groupAria}
            className="flex flex-col gap-2.5"
          >
            {options.map((option) => {
              const Icon = ICONS[option.method];
              const id = `checkout-payment-${option.method.toLowerCase()}`;
              const noteId = `${id}-note`;
              const checked = field.value === option.method;

              return (
                <label
                  key={option.method}
                  htmlFor={id}
                  className={[
                    "flex items-center gap-3.5 rounded-xl border-[1.5px] p-4 transition-colors",
                    "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring",
                    checked
                      ? "border-primary [background:color-mix(in_oklab,var(--color-primary)_6%,var(--color-card))]"
                      : "border-border",
                    option.enabled
                      ? "cursor-pointer hover:border-primary/60"
                      : "cursor-not-allowed opacity-60",
                  ].join(" ")}
                >
                  <input
                    id={id}
                    type="radio"
                    className="size-4 shrink-0 accent-primary"
                    value={option.method}
                    checked={checked}
                    disabled={!option.enabled}
                    aria-describedby={noteId}
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    onChange={() => field.onChange(option.method)}
                  />

                  <span
                    className="inline-flex size-[38px] shrink-0 items-center justify-center rounded-md text-primary"
                    style={{
                      background:
                        "color-mix(in oklab, var(--color-primary) 10%, var(--color-card))",
                    }}
                  >
                    <Icon className="size-5" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <b className="block text-[14.5px] text-foreground">
                      {option.title}
                    </b>
                    <span
                      id={noteId}
                      className="text-[12.5px] text-muted-foreground"
                    >
                      {option.blockedBy === "account-required"
                        ? dict.checkout.payment.accountRequired
                        : option.note}
                    </span>
                  </span>

                  {option.blockedBy === "account-required" && (
                    <Link
                      href="/login?redirect=/checkout"
                      className="shrink-0 rounded text-[12.5px] font-medium text-primary underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {dict.checkout.payment.signIn}
                    </Link>
                  )}
                </label>
              );
            })}
          </div>
        )}
      />

      <p className="mt-3.5 flex items-start gap-2 text-[12.5px] text-muted-foreground">
        <Phone className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        {dict.checkout.paymentManagerNote}
      </p>
    </section>
  );
}
