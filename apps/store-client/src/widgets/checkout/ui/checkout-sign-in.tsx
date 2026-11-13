"use client";

import { useState } from "react";
import { useAuthControllerRequestPasswordReset } from "@/entities/session";
import { LoginForm } from "@/features/auth";
import { dict } from "@/shared/config";
import { apiErrorStatus } from "@/shared/lib";
import { emailField } from "@/shared/lib/form-fields";

/** The reset-link address rule — `RequestPasswordResetDto.email`. */
const RESET_EMAIL = emailField();

interface CheckoutSignInProps {
  /** The checkout e-mail — the address that has the account. */
  email: string;
  /** Signed in; checkout stays on step 1 with everything typed so far. */
  onAuthenticated: () => void;
}

const LINK_BUTTON =
  "rounded-sm font-semibold text-primary underline underline-offset-2 hover:text-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

/**
 * CheckoutSignIn — the sign-in the guest contact block turns into when the
 * address already has an account (TASK-2010, B-12 тема 2 (б)).
 *
 * The full {@link LoginForm} in its in-place mode: password or Google (which
 * returns to /checkout), no «Реєстрація» — the account is right there. The form
 * starts on the checkout address.
 *
 * «Немає пароля?» is for an account made at an earlier checkout and never given
 * a password: the reset letter is the only way in, so both it and the form's
 * own «Забули пароль?» send one to the checkout address — and stay on this
 * page, where a navigation would cost the shopper the filled form. The
 * confirmation is neutral («якщо на цю пошту є акаунт…»), like /forgot-password.
 *
 * Lives in the widget because it composes another feature's form; the contact
 * block (`features/checkout`) only renders what it is handed.
 */
export function CheckoutSignIn({
  email,
  onAuthenticated,
}: CheckoutSignInProps) {
  const g = dict.checkout.guest;
  const reset = useAuthControllerRequestPasswordReset();
  // The checkout address is judged by the same rule as `RequestPasswordResetDto`
  // before anything is sent (forms Rule 5c) — a request that can only 400 is
  // not made, and the shopper is told what to fix instead of "no luck".
  const [invalidEmail, setInvalidEmail] = useState(false);
  const sendLink = () => {
    const parsed = RESET_EMAIL.safeParse(email);
    setInvalidEmail(!parsed.success);
    if (!parsed.success) {
      reset.reset();
      return;
    }
    reset.mutate({ data: { email: parsed.data } });
  };

  const status = apiErrorStatus(reset.error);

  return (
    <div className="flex flex-col gap-3">
      <LoginForm
        onAuthenticated={onAuthenticated}
        onForgotPassword={sendLink}
        redirectTo="/checkout"
        defaultEmail={email}
        showRegisterLink={false}
      />
      <p className="text-sm text-muted-foreground">
        {g.noPasswordPrompt}{" "}
        <button
          type="button"
          onClick={sendLink}
          disabled={reset.isPending}
          className={LINK_BUTTON}
        >
          {reset.isPending ? g.noPasswordSending : g.noPasswordCta}
        </button>
      </p>
      {reset.isSuccess && (
        <p role="status" className="text-sm text-foreground">
          {g.noPasswordSent}
        </p>
      )}
      {invalidEmail && (
        <p role="alert" className="text-sm text-destructive">
          {dict.forms.emailInvalid}
        </p>
      )}
      {reset.isError && (
        <p role="alert" className="text-sm text-destructive">
          {status === 429
            ? dict.auth.forgotPassword.errorTooMany
            : g.noPasswordError}
        </p>
      )}
    </div>
  );
}
