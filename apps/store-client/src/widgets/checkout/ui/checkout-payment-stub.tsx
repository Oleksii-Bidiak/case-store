"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { dict } from "@/shared/config";

/**
 * CheckoutPaymentStub — the "Оплата" section. STUB: there is no online-payment
 * backend yet (TASK-034 is parked), so the method choice + "списати бонуси"
 * (loyalty, TASK-175) are local-only and do not affect the order. Kept visually
 * faithful to the mockup so the flow reads complete.
 */
export function CheckoutPaymentStub() {
  const [method, setMethod] = useState("card");
  const [bonus, setBonus] = useState(false);

  return (
    <section className="rounded-[18px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h2 className="mb-1.5 font-display text-lg font-bold text-foreground">
        {dict.checkout.paymentHeading}
      </h2>
      <p className="mb-4 text-[12.5px] text-muted-foreground">
        {dict.checkout.paymentStubNote}
      </p>

      <div
        role="radiogroup"
        aria-label={dict.checkout.paymentMethodAria}
        className="flex flex-col gap-2.5"
      >
        {dict.checkout.paymentMethods.map((option) => {
          const on = option.key === method;
          return (
            <label
              key={option.key}
              className={`flex cursor-pointer items-center gap-3.5 rounded-xl border-[1.5px] p-4 transition-colors ${
                on
                  ? "border-primary [background:color-mix(in_oklab,var(--color-primary)_6%,var(--color-card))]"
                  : "border-border"
              }`}
            >
              <input
                type="radio"
                name="checkout-payment"
                checked={on}
                onChange={() => setMethod(option.key)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  on ? "border-primary" : "border-border"
                }`}
              >
                {on && <span className="size-2.5 rounded-full bg-primary" />}
              </span>
              <span
                className="inline-flex size-[38px] shrink-0 items-center justify-center rounded-[10px] text-primary"
                style={{
                  background:
                    "color-mix(in oklab, var(--color-primary) 10%, var(--color-card))",
                }}
              >
                <CreditCard className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-[14.5px] text-foreground">
                  {option.title}
                </b>
                <span className="text-[12.5px] text-muted-foreground">
                  {option.note}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <label className="mt-4 flex cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={bonus}
          onChange={() => setBonus((v) => !v)}
          className="sr-only"
        />
        <span
          aria-hidden="true"
          className={`flex size-5 shrink-0 items-center justify-center rounded-[6px] border-[1.5px] ${
            bonus ? "border-primary bg-primary" : "border-border"
          }`}
        >
          {bonus && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary-foreground"
              aria-hidden="true"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
        </span>
        <span className="text-sm text-foreground">
          {dict.checkout.bonusesStub}
        </span>
      </label>
    </section>
  );
}
