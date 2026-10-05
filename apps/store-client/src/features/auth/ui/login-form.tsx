"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { useAuth, useAuthControllerLogin } from "@/entities/session";
import { getGetCartQueryKey } from "@/entities/cart";
import { getGetWishlistQueryKey } from "@/entities/wishlist";
import { dict } from "@/shared/config";
import { apiErrorStatus } from "@/shared/lib";
import { Button } from "@/shared/ui";
import { PASSWORD_RESET_DONE_PARAM } from "../lib/password-reset-done";
import { sanitizeRedirectTarget } from "../lib/sanitize-redirect-target";
import { AUTH_LINK_CLASS, AUTH_SUBMIT_CLASS, AuthField } from "./auth-field";

const loginSchema = z.object({
  email: z.string().email(dict.auth.login.validationEmail),
  password: z.string().min(1, dict.auth.login.validationPassword),
});

type LoginValues = z.infer<typeof loginSchema>;

const socialClass = "h-11 flex-1 gap-2 text-sm font-medium";

/**
 * Backend Google OAuth entry point (TASK-168). A plain top-level browser
 * navigation — deliberately NOT an Orval hook or fetch call: the route is a
 * pure redirect (302 to Google's consent screen) excluded from the OpenAPI
 * spec. The backend re-sanitizes `redirect` server-side.
 */
function buildGoogleOAuthUrl(redirect: string): string {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  return `${apiBase}/api/auth/google?redirect=${encodeURIComponent(redirect)}`;
}

/**
 * Whether the Google sign-in button is offered at all (TASK-402).
 *
 * The button is a plain link into `GET /api/auth/google`, which 500s unless the
 * deployment carries a real `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` pair. On
 * the demo stand it did not, so the most prominent control on the login screen
 * led straight to an error page. Off unless the env var explicitly says `true`:
 * a missing variable means "nobody configured Google here", and the safe
 * reading of that is to hide the button rather than to advertise a dead route.
 *
 * Literal `process.env.X` access on purpose — that is the form Next.js inlines
 * at build time for `NEXT_PUBLIC_*`.
 */
function isGoogleAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";
}

interface LoginFormProps {
  /**
   * Slide-out mode: called after a successful sign-in (e.g. to close the auth
   * sheet). When set, the form does NOT navigate — the reactive `isAuthenticated`
   * flip is what updates the header.
   */
  onAuthenticated?: () => void;
  /** Slide-out mode: switch to the register tab instead of linking to /register. */
  onSwitchToRegister?: () => void;
  /**
   * Slide-out mode: switch to the forgot-password view instead of linking to
   * /forgot-password. When omitted (page mode) the "Забули пароль?" control
   * renders as a link.
   */
  onForgotPassword?: () => void;
}

/** LoginForm — email/password sign-in with zod validation. */
export function LoginForm({
  onAuthenticated,
  onSwitchToRegister,
  onForgotPassword,
}: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { isAuthenticated, setTokens } = useAuth();

  const inSheet = Boolean(onAuthenticated);

  // Honour a `?redirect=` param so post-login navigation returns the user to
  // where they came from (e.g. /checkout, or the product whose review they came
  // to write). Only same-origin paths survive the sanitizer — see its file for
  // why a leading-slash check alone was an open redirect.
  const redirectTarget = sanitizeRedirectTarget(searchParams.get("redirect"));

  // Failure-redirect path of the Google OAuth flow (TASK-168): the backend
  // callback funnels every failure (denied consent, unverified email, locked
  // account — deliberately indistinguishable) to /login?oauthError=1.
  const hasOAuthError = Boolean(searchParams.get("oauthError"));

  // TASK-871: /reset-password sends a successful reset here with this flag.
  // Page mode only — the header sheet can open over /login, and the
  // confirmation belongs to the page the reset form navigated to.
  const passwordResetDone =
    !inSheet && searchParams.get(PASSWORD_RESET_DONE_PARAM) === "1";

  // Read per render rather than at module scope so a test (and a redeployed
  // container) sees the value it actually set.
  const googleEnabled = isGoogleAuthEnabled();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const login = useAuthControllerLogin();

  // Page mode only: already signed in → leave the auth page. In slide-out mode we
  // stay put (the sheet closes itself and the header re-renders in place).
  useEffect(() => {
    if (inSheet) return;
    if (isAuthenticated) {
      router.replace(redirectTarget);
    }
  }, [inSheet, isAuthenticated, router, redirectTarget]);

  const onSubmit = (values: LoginValues) => {
    login.mutate(
      { data: values },
      {
        onSuccess: (res) => {
          const token = res?.data?.accessToken;
          if (token) {
            setTokens(token);
          }
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
          queryClient.invalidateQueries({
            queryKey: getGetWishlistQueryKey(),
          });
          if (onAuthenticated) {
            onAuthenticated();
          } else {
            router.push(redirectTarget);
          }
        },
      },
    );
  };

  const status = apiErrorStatus(login.error);
  // Every 401 is the same generic "Invalid credentials" — the API deliberately
  // does not distinguish unknown email / wrong password / deactivated account
  // (TASK-274), so there is nothing here to branch on. A deactivated owner is
  // told the truth by email instead (TASK-287); everyone sees the support link
  // below the form.
  //
  // A 429 is different in kind, and used to read as "щось пішло не так" — which
  // invites the shopper to keep hammering the endpoint that is already refusing
  // them (TASK-402). It names the IP throttle's window (60 s) and nothing else:
  // the per-account 15-minute lockout stays unmentioned on purpose, because a
  // message that can only appear for a real account is an enumeration oracle.
  const errorMessage =
    status === 401
      ? dict.auth.login.errorInvalid
      : status === 429
        ? dict.auth.login.errorTooMany
        : login.isError
          ? dict.common.genericError
          : null;

  const forgotClass = `-mt-1 self-end text-sm font-semibold ${AUTH_LINK_CLASS}`;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      {/* Not an error: a confirmation. `text-foreground` on the tinted box —
          `text-success` alone is ≈3.3:1 on white and fails AA. */}
      {passwordResetDone && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-foreground"
        >
          <CheckCircle2
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-success"
          />
          <span>{dict.auth.resetPassword.success}</span>
        </p>
      )}

      <AuthField
        id="login-email"
        label={dict.auth.login.email}
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />

      <AuthField
        id="login-password"
        label={dict.auth.login.password}
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />

      {/* Password reset (TASK-169). Sheet mode flips to the in-sheet forgot view;
          page mode links to the standalone /forgot-password page. */}
      {onForgotPassword ? (
        <button
          type="button"
          onClick={onForgotPassword}
          className={forgotClass}
        >
          {dict.auth.login.forgot}
        </button>
      ) : (
        <Link href="/forgot-password" className={forgotClass}>
          {dict.auth.login.forgot}
        </Link>
      )}

      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {/* Additive to errorMessage — they never fire from the same attempt
          (one is a form submission, the other a redirect back from Google). */}
      {hasOAuthError && (
        <p role="alert" className="text-sm text-destructive">
          {dict.auth.oauth.error}
        </p>
      )}

      <Button
        type="submit"
        disabled={login.isPending}
        className={AUTH_SUBMIT_CLASS}
      >
        {login.isPending ? dict.auth.login.submitting : dict.auth.login.submit}
      </Button>

      {/* Google is a real redirect-based OAuth flow (TASK-168); Apple remains
          an honest coming-soon stub (owner decision 2026-07-11). */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {dict.auth.login.orDivider}
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="flex gap-3">
        {googleEnabled && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              // Full top-level navigation — the redirect target is the same
              // value the password login navigates to after success, so both
              // auth methods share one "where do we land" source of truth.
              window.location.href = buildGoogleOAuthUrl(redirectTarget);
            }}
            className={socialClass}
          >
            <GoogleIcon />
            {dict.auth.login.google}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => toast(dict.auth.login.socialSoon)}
          className={socialClass}
        >
          <AppleIcon />
          {dict.auth.login.apple}
        </Button>
      </div>

      {/* Always visible, for everyone (TASK-287). The API can no longer tell a
          user that their account is deactivated, so the form must always offer a
          human route out — it reveals nothing about any account's state. */}
      <p className="text-center text-sm text-muted-foreground">
        {dict.auth.support.loginTrouble}{" "}
        <Link href="/contact" className={`font-semibold ${AUTH_LINK_CLASS}`}>
          {dict.auth.support.contactLink}
        </Link>
      </p>

      <p className="text-center text-sm text-muted-foreground">
        {dict.auth.login.noAccount}{" "}
        {onSwitchToRegister ? (
          <button
            type="button"
            onClick={onSwitchToRegister}
            className={AUTH_LINK_CLASS}
          >
            {dict.auth.login.registerLink}
          </button>
        ) : (
          <Link href="/register" className={AUTH_LINK_CLASS}>
            {dict.auth.login.registerLink}
          </Link>
        )}
      </p>
    </form>
  );
}

/** Google brand glyph (monochrome, currentColor) — from the design import. */
function GoogleIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M21 12.2c0-.6 0-1.2-.1-1.8H12v3.4h5c-.2 1.2-.9 2.2-1.9 2.9v2.4h3.1c1.8-1.7 2.8-4.1 2.8-6.9z" />
      <path d="M12 21c2.4 0 4.5-.8 6-2.3l-3.1-2.4c-.8.6-1.9.9-2.9.9-2.3 0-4.2-1.5-4.9-3.6H3.9v2.4C5.4 19 8.5 21 12 21z" />
      <path d="M7.1 13.6c-.2-.6-.3-1.1-.3-1.6s.1-1.1.3-1.6V8H3.9C3.3 9.2 3 10.6 3 12s.3 2.8.9 4l3.2-2.4z" />
      <path d="M12 6.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6C16.5 3.9 14.4 3 12 3 8.5 3 5.4 5 3.9 8l3.2 2.4C7.8 8.1 9.7 6.6 12 6.6z" />
    </svg>
  );
}

/** Apple brand glyph (monochrome, currentColor) — from the design import. */
function AppleIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M16 3c.1 1-.3 2-1 2.8-.7.8-1.7 1.4-2.7 1.3-.1-1 .4-2 1-2.7C14 3.6 15 3.1 16 3zM18.5 17c-.5 1.1-.7 1.6-1.3 2.6-.9 1.4-2.1 3.1-3.6 3.1-1.3 0-1.7-.8-3.5-.8s-2.2.8-3.5.8c-1.5 0-2.6-1.5-3.5-2.9C-1 16.5-.4 11 2.4 9.4c1-.6 2-.9 3-.9 1.3 0 2.1.8 3.2.8 1 0 1.7-.8 3.2-.8 1 0 2.1.3 3 1-2.5 1.4-2.1 5 .7 6.5z" />
    </svg>
  );
}
