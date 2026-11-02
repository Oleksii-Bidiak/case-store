"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getGetCartQueryKey } from "@/entities/cart";
import {
  useAuth,
  useAuthControllerConfirmEmailVerification,
} from "@/entities/session";
import { getGetWishlistQueryKey } from "@/entities/wishlist";
import { dict } from "@/shared/config";
import { apiErrorCode, apiErrorStatus } from "@/shared/lib";
import { AUTH_LINK_CLASS } from "./auth-field";
import { LoginForm } from "./login-form";

/** 403 from confirm: an account WITH a password, and not signed in as it. */
const VERIFY_SIGN_IN_REQUIRED = "VERIFY_SIGN_IN_REQUIRED";

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
 * address.
 *
 * ── Who may confirm (TASK-2010, TASK-2362) ───────────────────────────────────
 * Confirming an address now takes it over from anyone who created an account
 * on it uninvited, so the server is strict about WHO clicked:
 *
 *   - **A password-less account** (made at checkout) — the link alone proves the
 *     address; the answer carries `data.session`, a fresh session for this
 *     device, which is stored right away.
 *   - **An account with a password** — only its owner, signed in. Anyone else
 *     gets 403 VERIFY_SIGN_IN_REQUIRED and the link is NOT spent: the page asks
 *     them to sign in, right here, and confirms again with the session. The
 *     request therefore waits for the silent session restore to settle — sent
 *     before it, the owner's own click would come back 403.
 */
export function VerifyEmailConfirm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const queryClient = useQueryClient();
  const { isInitializing, setTokens } = useAuth();

  const confirm = useAuthControllerConfirmEmailVerification({
    mutation: {
      onSuccess: (response) => {
        const accessToken = response?.data?.session?.accessToken;
        if (!accessToken) return;
        setTokens(accessToken);
        void queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
        void queryClient.invalidateQueries({
          queryKey: getGetWishlistQueryKey(),
        });
      },
    },
  });
  const { mutate } = confirm;

  // Fire exactly once per token. A mutation in an effect would otherwise run
  // twice under StrictMode and burn the single-use token on the first call,
  // making the second — the one whose result the user sees — fail.
  const requestedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token || isInitializing || requestedTokenRef.current === token) {
      return;
    }
    requestedTokenRef.current = token;
    mutate({ data: { token } });
  }, [token, isInitializing, mutate]);

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
    // TASK-485: confirming the address also moved this person's earlier guest
    // orders onto their account, and THIS RESPONSE is the only place that count
    // exists — it describes an event, not a property of the account, so nothing
    // can be asked for it afterwards. Carrying it on the link hands it to the
    // cabinet's banner and lets it expire with the navigation.
    const claimed = confirm.data?.data?.claimedOrders ?? 0;
    const accountHref =
      claimed > 0 ? `/account?claimed=${claimed}` : "/account";

    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">
          {d.successHeading}
        </h2>
        <p className="text-sm text-muted-foreground">{d.successBody}</p>
        <p>
          <Link href={accountHref} className={`font-medium ${AUTH_LINK_CLASS}`}>
            {d.toAccount}
          </Link>
        </p>
      </div>
    );
  }

  if (
    confirm.isError &&
    apiErrorStatus(confirm.error) === 403 &&
    apiErrorCode(confirm.error) === VERIFY_SIGN_IN_REQUIRED
  ) {
    const s = dict.auth.verifySignIn;
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">{s.heading}</h2>
        <p role="alert" className="text-sm text-muted-foreground">
          {s.body}
        </p>
        {/* In place: the session lands, and the same token is confirmed
            again — now with the owner's bearer. Google comes back here. */}
        <LoginForm
          onAuthenticated={() => mutate({ data: { token } })}
          redirectTo={`/verify-email?token=${encodeURIComponent(token)}`}
          showRegisterLink={false}
        />
        <p className="text-sm text-muted-foreground">
          {s.forgot}{" "}
          <Link href="/forgot-password" className={AUTH_LINK_CLASS}>
            {s.forgotLink}
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
          <Link href="/account" className={`font-medium ${AUTH_LINK_CLASS}`}>
            {d.toAccount}
          </Link>
        </p>
      </div>
    );
  }

  // Waiting on the API (TASK-871): a spinner next to the text, so a slow
  // network does not read as a frozen page. The live region is the text; the
  // icon is decorative and stops spinning under prefers-reduced-motion.
  return (
    <p
      role="status"
      aria-busy="true"
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <Loader2
        aria-hidden="true"
        data-testid="verify-email-spinner"
        className="size-4 shrink-0 text-primary motion-safe:animate-spin"
      />
      <span>{d.checking}</span>
    </p>
  );
}

function BackLink() {
  return (
    <p className="text-center text-sm text-muted-foreground">
      <Link href="/login" className={AUTH_LINK_CLASS}>
        {dict.auth.resetPassword.backToLogin}
      </Link>
    </p>
  );
}
