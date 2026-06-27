"use client";

import { forwardRef } from "react";
import { useWatch, type Control } from "react-hook-form";
import { dict } from "@/shared/config";
import type { CheckoutFormValues } from "../model/checkout-schema";

interface CheckoutReviewStepProps {
  control: Control<CheckoutFormValues>;
}

/**
 * CheckoutReviewStep — read-only summary of the delivery details entered in
 * step 1, shown on the review step before the order is placed (TASK-146).
 *
 * Subscribes to the form via `useWatch`, so editing a value on step 1 and
 * returning is reflected here. Purely presentational — no inputs, no mutations.
 * The heading is focusable (`tabIndex={-1}`) and forwards its ref to
 * `CheckoutView`, which moves focus here on step entry (WCAG 2.4.3).
 */
export const CheckoutReviewStep = forwardRef<
  HTMLHeadingElement,
  CheckoutReviewStepProps
>(function CheckoutReviewStep({ control }, ref) {
  const values = useWatch({ control });
  const fullName = [values.firstName, values.lastName]
    .filter(Boolean)
    .join(" ");

  const row = (label: string, value?: string) => (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{value}</span>
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
        {row(dict.checkout.fields.phone, values.phone)}
        {row(dict.checkout.fields.city, values.city)}
        {row(dict.checkout.fields.deliveryAddress, values.deliveryAddress)}
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
