"use client";

import { forwardRef } from "react";
import { useWatch, type Control } from "react-hook-form";
import { dict } from "@/shared/config";
import type { CheckoutFormValues } from "../model/checkout-schema";
import {
  DEFAULT_PAYMENT_METHOD,
  paymentMethodTitle,
} from "../model/payment-methods";

interface CheckoutReviewStepProps {
  control: Control<CheckoutFormValues>;
  /**
   * Read the contact email back (TASK-882). Only a guest types one — a
   * signed-in shopper's account email is the source of truth and the form
   * never holds it, so for them the row would be empty.
   */
  showEmail: boolean;
}

/**
 * CheckoutReviewStep — read-only summary of everything entered in step 1,
 * shown on the review step before the order is placed (TASK-146).
 *
 * TASK-882 (Checkout.dc.html «ЦІЛЬ · TASK-882»): the read-back is complete — a
 * guest sees the email the confirmation goes to, and every shopper sees the
 * payment method they picked, named exactly as its radio was
 * ({@link paymentMethodTitle}). City and branch share one «Доставка» row.
 *
 * Subscribes to the form via `useWatch`, so editing a value on step 1 and
 * returning is reflected here. Purely presentational — no inputs, no mutations.
 * The heading is focusable (`tabIndex={-1}`) and forwards its ref to
 * `CheckoutView`, which moves focus here on step entry (WCAG 2.4.3).
 */
export const CheckoutReviewStep = forwardRef<
  HTMLHeadingElement,
  CheckoutReviewStepProps
>(function CheckoutReviewStep({ control, showEmail }, ref) {
  const values = useWatch({ control });
  const fullName = [values.firstName, values.lastName]
    .filter(Boolean)
    .join(" ");
  const delivery = [values.city, values.deliveryAddress]
    .filter(Boolean)
    .join(", ");
  const email = values.email?.trim();

  const row = (label: string, value?: string) => (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right break-words text-foreground">
        {value}
      </span>
    </div>
  );

  return (
    <section className="flex flex-col gap-4">
      <h2
        ref={ref}
        tabIndex={-1}
        className="text-lg font-semibold text-foreground outline-none"
      >
        {dict.checkout.reviewHeading}
      </h2>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-sm text-card-foreground">
        {fullName && <p className="font-medium text-foreground">{fullName}</p>}
        {showEmail && email && row(dict.checkout.review.email, email)}
        {row(dict.checkout.fields.phone, values.phone)}
        {row(dict.checkout.review.delivery, delivery)}
        {row(
          dict.checkout.review.payment,
          paymentMethodTitle(values.paymentMethod ?? DEFAULT_PAYMENT_METHOD),
        )}
        {values.notes && (
          <div className="flex flex-col">
            <span className="text-muted-foreground">
              {dict.checkout.orderNotes}
            </span>
            <span className="text-foreground">{values.notes}</span>
          </div>
        )}
      </div>
    </section>
  );
});
