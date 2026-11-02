"use client";

import type { ReactNode, Ref } from "react";
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import { UserRound } from "lucide-react";
import { dict } from "@/shared/config";
import { Input, Label } from "@/shared/ui";
import type { CheckoutFormValues } from "../model/checkout-schema";

interface CheckoutContactFieldsProps {
  register: UseFormRegister<CheckoutFormValues>;
  errors: FieldErrors<CheckoutFormValues>;
  /**
   * The id of the step's `<form>` when this block is rendered outside it
   * (TASK-2010: the inline sign-in is a form of its own, and forms do not
   * nest). Enter in the e-mail still submits the step.
   */
  formId?: string;
  /** The e-mail field lost focus — checkout asks whether it has an account. */
  onEmailBlur?: (email: string) => void;
  /** «Створити акаунт на цю пошту» (TASK-2010). */
  createAccount?: boolean;
  onCreateAccountChange?: (checked: boolean) => void;
  /**
   * Why the box is ticked or what unticking it changed — announced through a
   * polite live region that stays mounted, so the change is heard.
   */
  accountNotice?: string | null;
  /**
   * The address already has an account: the box is replaced by the sign-in
   * block, which the widget composes (`signIn`) — a feature may not render
   * another feature's form.
   */
  hasAccount?: boolean;
  signIn?: ReactNode;
  /** Focus target after a 409 ACCOUNT_EXISTS brings the shopper back here. */
  signInRef?: Ref<HTMLDivElement>;
}

const CREATE_ACCOUNT_ID = "checkout-create-account";
const CREATE_ACCOUNT_HINT_ID = "checkout-create-account-hint";
export const CHECKOUT_SIGN_IN_ID = "checkout-sign-in";

/**
 * CheckoutContactFields — the guest contact block (TASK-338), and since
 * TASK-2010 the place an account is made or found.
 *
 * Rendered only for a shopper without an account, because the backend ignores a
 * contact block from an authenticated caller: their account is the source of
 * truth for who they are.
 *
 * Asks for **one** thing the delivery fieldset does not already have — an email.
 * The `contact` payload also needs a name and a phone, and those are exactly the
 * recipient name and the phone the courier will ring; `useCheckout` reuses them.
 *
 * The email is not decoration: it carries the confirmation letter and, with it,
 * the tokenised status link that is a guest's ONLY way back to their order once
 * the cart cookie is gone or they switch device (edge case E-17).
 *
 * ── The account (TASK-2010, B-12 тема 2, B-13 §0) ───────────────────────────
 * The block sits right after the delivery method, before the address, so a
 * sign-in happens before the shopper has typed much. Two shapes:
 *
 *   - **New address** — the «Створити акаунт на цю пошту» box, off by default
 *     (it is a consent). A promo code or a card payment ticks it, and
 *     {@link CheckoutContactFieldsProps.accountNotice} says why.
 *   - **Address with an account** — no box (a second account is never made);
 *     «увійдіть» with the sign-in the widget hands in. The shopper may still go
 *     on as a guest.
 */
export function CheckoutContactFields({
  register,
  errors,
  formId,
  onEmailBlur,
  createAccount = false,
  onCreateAccountChange,
  accountNotice = null,
  hasAccount = false,
  signIn,
  signInRef,
}: CheckoutContactFieldsProps) {
  const message = errors.email?.message;
  const emailField = register("email");
  const g = dict.checkout.guest;
  const offersAccount = Boolean(onCreateAccountChange) && !hasAccount;

  return (
    <fieldset className="flex flex-col gap-4 border-0 p-0">
      <legend className="mb-2 text-lg font-semibold text-foreground">
        {g.heading}
      </legend>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="checkout-email">{g.emailLabel}</Label>
        <Input
          id="checkout-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          form={formId}
          placeholder={g.emailPlaceholder}
          aria-invalid={message ? true : undefined}
          aria-describedby={
            message ? "checkout-email-error" : "checkout-email-hint"
          }
          {...emailField}
          onBlur={(event) => {
            void emailField.onBlur(event);
            onEmailBlur?.(event.target.value);
          }}
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
            {g.emailHint}
          </p>
        )}
      </div>

      {offersAccount && (
        <div className="flex items-start gap-2.5 text-sm text-foreground">
          <input
            id={CREATE_ACCOUNT_ID}
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
            checked={createAccount}
            onChange={(event) => onCreateAccountChange?.(event.target.checked)}
            aria-describedby={CREATE_ACCOUNT_HINT_ID}
          />
          <div className="flex flex-col gap-0.5">
            <label
              htmlFor={CREATE_ACCOUNT_ID}
              className="cursor-pointer font-medium"
            >
              {g.createAccountLabel}
            </label>
            <p
              id={CREATE_ACCOUNT_HINT_ID}
              className="text-xs text-muted-foreground"
            >
              {g.createAccountHint}
            </p>
          </div>
        </div>
      )}

      {hasAccount && (
        <div
          ref={signInRef}
          id={CHECKOUT_SIGN_IN_ID}
          tabIndex={-1}
          role="group"
          aria-labelledby={`${CHECKOUT_SIGN_IN_ID}-heading`}
          className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-start gap-2">
            <UserRound
              className="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden
            />
            <div className="flex flex-col gap-0.5">
              <p
                id={`${CHECKOUT_SIGN_IN_ID}-heading`}
                className="text-sm font-semibold text-foreground"
              >
                {g.accountExistsHeading}
              </p>
              <p className="text-xs text-muted-foreground">
                {g.accountExistsBody} {g.accountExistsPerks}
              </p>
            </div>
          </div>
          {signIn}
          <p className="text-xs text-muted-foreground">{g.continueAsGuest}</p>
        </div>
      )}

      {/* Always mounted: a live region that appears together with its text
          is not reliably announced. */}
      <p
        role="status"
        aria-live="polite"
        className={accountNotice ? "text-sm text-foreground" : "sr-only"}
      >
        {accountNotice}
      </p>

      <p className="text-xs text-muted-foreground">{g.contactNote}</p>
    </fieldset>
  );
}
