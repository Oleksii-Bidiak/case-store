"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuthControllerConfirmEmailVerification } from "@/entities/session";
import { dict } from "@/shared/config";

/**
 * VerifyEmailConfirm — the landing page for the link in the verification email
 * (TASK-342). The API sends `${STORE_CLIENT_URL}/verify-email?token=…`.
 *
 * Public by design: the click arrives from a mail client that carries no
 * session, often on a different device than the one that requested it.
 *
 * **On the error copy.** `EmailVerificationService.confirm` answers EVERY
 * failure — unknown token, already used, expired, banned owner, and the
 * address-changed refusal — with one identical 400. That is deliberate
 * anti-enumeration: a stranger holding a random token must not be able to learn
 * anything about the account behind it. The consequence for this component is
 * that it **cannot** tell the stale-address case apart from an expired link, so
 * it must not claim to. It names the plausible causes (including "you changed
 * your address after the mail was sent") and points at the one action that
 * fixes all of them — request a fresh link, which will go to the CURRENT
 * address. That is a real explanation rather than "щось пішло не так", without
 * inventing a diagnosis we do not have.
 */
export function VerifyEmailConfirm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const confirm = useAuthControllerConfirmEmailVerification();
  const { mutate } = confirm;

  // Fire exactly once per token. A mutation in an effect would otherwise run
  // twice under StrictMode and burn the single-use token on the first call,
  // making the second — the one whose result the user sees — fail.
  const requestedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token || requestedTokenRef.current === token) {
      return;
    }
    requestedTokenRef.current = token;
    mutate({ data: { token } });
  }, [token, mutate]);

  const d = dict.auth.verifyEmail;

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-sm text-destructive">
          {d.errorMissingToken}
        </p>
        <BackLink />
      </div>
    );
  }

  if (confirm.isSuccess) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">
          {d.successHeading}
        </h2>
        <p className="text-sm text-muted-foreground">{d.successBody}</p>
        <p>
          <Link
            href="/account"
            className="font-medium text-primary hover:underline"
          >
            {d.toAccount}
          </Link>
        </p>
      </div>
    );
  }

  if (confirm.isError) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">
          {d.errorHeading}
        </h2>
        <p role="alert" className="text-sm text-destructive">
          {d.errorBody}
        </p>
        <p className="text-sm text-muted-foreground">{d.errorNextStep}</p>
        <p>
          <Link
            href="/account"
            className="font-medium text-primary hover:underline"
          >
            {d.toAccount}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <p role="status" className="text-sm text-muted-foreground">
      {d.checking}
    </p>
  );
}

function BackLink() {
  return (
    <p className="text-center text-sm text-muted-foreground">
      <Link href="/login" className="text-primary hover:underline">
        {dict.auth.resetPassword.backToLogin}
      </Link>
    </p>
  );
}
