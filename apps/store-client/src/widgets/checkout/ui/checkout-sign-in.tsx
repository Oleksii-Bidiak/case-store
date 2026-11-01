"use client";

import { useAuthControllerRequestPasswordReset } from "@/entities/session";
import { LoginForm } from "@/features/auth";
import { dict } from "@/shared/config";
import { apiErrorStatus } from "@/shared/lib";

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
  const sendLink = () => reset.mutate({ data: { email } });

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
