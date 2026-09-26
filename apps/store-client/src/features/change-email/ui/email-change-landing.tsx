"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAuth,
  useConfirmEmailChange,
  useRevertEmailChange,
} from "@/entities/session";
import { dict } from "@/shared/config";
import { apiErrorStatus } from "@/shared/lib/api-error";

type LandingCopy = {
  checking: string;
  successHeading: string;
  successBody: string;
  errorMissingToken: string;
  errorHeading: string;
  errorBody: string;
  errorTaken: string;
  errorNextStep: string;
};

type Mutation = ReturnType<typeof useConfirmEmailChange>;

interface LandingProps {
  mutation: Mutation;
  copy: LandingCopy;
  /** What to offer once it worked — both flows end every session. */
  successActions: ReactNode;
  /** What to offer when it did not. */
  errorActions: ReactNode;
}

const linkClass = "font-medium text-primary hover:underline";

/**
 * The shared body of the two address-change landing pages (TASK-396).
 *
 * Both are public — the click arrives from a mail client with no session — and
 * both fire their single-use token exactly ONCE: a mutation in an effect would
 * otherwise run twice under StrictMode and burn the token on the first call,
 * making the second (the one whose result is shown) fail. The same guard as
 * `VerifyEmailConfirm`.
 *
 * Both also END EVERY SESSION server-side, possibly including one open in this
 * very browser. So on success the in-memory access token and every cached
 * authenticated read are dropped here too; otherwise the header would keep
 * showing a signed-in shopper until their next request failed.
 */
function EmailChangeLanding({
  mutation,
  copy,
  successActions,
  errorActions,
}: LandingProps) {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const queryClient = useQueryClient();
  const { clearTokens } = useAuth();
  const { mutate } = mutation;

  const requestedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token || requestedTokenRef.current === token) {
      return;
    }
    requestedTokenRef.current = token;
    mutate(
      { data: { token } },
      {
        onSuccess: () => {
          clearTokens();
          queryClient.clear();
        },
      },
    );
  }, [token, mutate, clearTokens, queryClient]);

  if (!token) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {copy.errorMissingToken}
      </p>
    );
  }

  if (mutation.isSuccess) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">
          {copy.successHeading}
        </h2>
        <p className="text-sm text-muted-foreground">{copy.successBody}</p>
        {successActions}
      </div>
    );
  }

  if (mutation.isError) {
    const taken = apiErrorStatus(mutation.error) === 409;
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">
          {copy.errorHeading}
        </h2>
        <p role="alert" className="text-sm text-destructive">
          {taken ? copy.errorTaken : copy.errorBody}
        </p>
        <p className="text-sm text-muted-foreground">{copy.errorNextStep}</p>
        {errorActions}
      </div>
    );
  }

  return (
    <p role="status" className="text-sm text-muted-foreground">
      {copy.checking}
    </p>
  );
}

/** `/confirm-email-change?token=…` — the link from the NEW inbox. */
export function ConfirmEmailChange() {
  const mutation = useConfirmEmailChange();
  const d = dict.auth.confirmEmailChange;

  return (
    <EmailChangeLanding
      mutation={mutation}
      copy={d}
      successActions={
        <p>
          <Link href="/login" className={linkClass}>
            {d.toLogin}
          </Link>
        </p>
      }
      errorActions={
        <p>
          <Link href="/account" className={linkClass}>
            {dict.auth.verifyEmail.toAccount}
          </Link>
        </p>
      }
    />
  );
}

/** `/revert-email-change?token=…` — "this wasn't me", from the OLD inbox. */
export function RevertEmailChange() {
  const mutation = useRevertEmailChange();
  const d = dict.auth.revertEmailChange;

  return (
    <EmailChangeLanding
      mutation={mutation}
      copy={d}
      successActions={
        <div className="flex flex-wrap gap-4">
          <Link href="/login" className={linkClass}>
            {d.toLogin}
          </Link>
          {/* A session was stolen or the password is known to someone else —
              the next thing to do is change it. */}
          <Link href="/forgot-password" className={linkClass}>
            {d.toForgotPassword}
          </Link>
        </div>
      }
      errorActions={
        <p>
          <Link href="/contact" className={linkClass}>
            {d.toContact}
          </Link>
        </p>
      }
    />
  );
}
