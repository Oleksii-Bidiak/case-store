import { Banknote, Phone } from "lucide-react";
import { dict } from "@/shared/config";

/**
 * CheckoutPayment — the "Оплата" section.
 *
 * The store has no online-payment provider yet (TASK-034), so there is exactly
 * one payment method and this section states it rather than offering a choice.
 *
 * It replaces a stub that rendered a working-looking radio group — "Картка
 * онлайн · Visa / Mastercard · Apple Pay, Google Pay", "Оплата при отриманні",
 * "Безготівковий рахунок" — none of which reached the API: `CreateOrderDto` has
 * no payment-method field, and every order was created with `paymentStatus:
 * PENDING` for an admin to settle by phone. A customer who picked "Картка
 * онлайн" and saw the order succeed had every reason to believe they had paid.
 * A single honest method is not a downgrade; the choice was never real.
 *
 * Purely presentational — no state, so no "use client".
 */
export function CheckoutPayment() {
  return (
    <section className="rounded-[18px] border border-border bg-card p-6 shadow-card">
      <h2 className="mb-4 font-display text-lg font-bold text-foreground">
        {dict.checkout.paymentHeading}
      </h2>

      <div className="flex items-center gap-3.5 rounded-xl border-[1.5px] border-primary p-4 [background:color-mix(in_oklab,var(--color-primary)_6%,var(--color-card))]">
        <span
          className="inline-flex size-[38px] shrink-0 items-center justify-center rounded-md text-primary"
          style={{
            background:
              "color-mix(in oklab, var(--color-primary) 10%, var(--color-card))",
          }}
        >
          <Banknote className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-[14.5px] text-foreground">
            {dict.checkout.paymentMethodTitle}
          </b>
          <span className="text-[12.5px] text-muted-foreground">
            {dict.checkout.paymentMethodNote}
          </span>
        </span>
      </div>

      <p className="mt-3.5 flex items-start gap-2 text-[12.5px] text-muted-foreground">
        <Phone className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        {dict.checkout.paymentManagerNote}
      </p>
    </section>
  );
}
