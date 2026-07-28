"use client";

import type { UseFormRegister, FieldErrors } from "react-hook-form";
import { dict } from "@/shared/config";
import { Input, Label } from "@/shared/ui";
import type { CheckoutFormValues } from "../model/checkout-schema";

interface CheckoutContactFieldsProps {
  register: UseFormRegister<CheckoutFormValues>;
  errors: FieldErrors<CheckoutFormValues>;
}

/**
 * CheckoutContactFields — the guest contact block (TASK-338).
 *
 * Rendered only for a shopper without an account, because the backend ignores a
 * contact block from an authenticated caller: their account is the source of
 * truth for who they are.
 *
 * Asks for **one** thing the delivery fieldset does not already have — an email.
 * The `contact` payload also needs a name and a phone, and those are exactly the
 * recipient name and the phone the courier will ring, both already typed one
 * section above; `useCheckout` reuses them. Asking a second time for facts we
 * hold would add friction to the very flow this task exists to unblock.
 *
 * The email is not decoration: it carries the confirmation letter and, with it,
 * the tokenised status link that is a guest's ONLY way back to their order once
 * the cart cookie is gone or they switch device (edge case E-17).
 */
export function CheckoutContactFields({
  register,
  errors,
}: CheckoutContactFieldsProps) {
  const message = errors.email?.message;

  return (
    <fieldset className="flex flex-col gap-4 border-0 p-0">
      <legend className="mb-2 text-lg font-semibold text-foreground">
        {dict.checkout.guest.heading}
      </legend>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="checkout-email">{dict.checkout.guest.emailLabel}</Label>
        <Input
          id="checkout-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={dict.checkout.guest.emailPlaceholder}
          aria-invalid={message ? true : undefined}
          aria-describedby={
            message ? "checkout-email-error" : "checkout-email-hint"
          }
          {...register("email")}
        />
        {message ? (
          <p
            id="checkout-email-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {message}
          </p>
        ) : (
          <p id="checkout-email-hint" className="text-sm text-muted-foreground">
            {dict.checkout.guest.emailHint}
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {dict.checkout.guest.contactNote}
      </p>
    </fieldset>
  );
}
