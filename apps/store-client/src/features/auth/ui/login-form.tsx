"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth, useAuthControllerLogin } from "@/entities/session";
import { getGetCartQueryKey } from "@/entities/cart";
import { getGetWishlistQueryKey } from "@/entities/wishlist";
import { dict } from "@/shared/config";

const loginSchema = z.object({
  email: z.string().email(dict.auth.login.validationEmail),
  password: z.string().min(1, dict.auth.login.validationPassword),
});

type LoginValues = z.infer<typeof loginSchema>;

const fieldClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-foreground transition-colors hover:border-muted-foreground/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const socialClass =
  "flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-background text-sm font-medium text-foreground transition-all hover:border-primary/40 hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]";

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
  // where they came from (e.g. /checkout). Only same-origin paths are allowed —
  // the leading-slash check prevents open-redirect attacks.
  const redirectParam = searchParams.get("redirect");
  const redirectTarget =
    redirectParam && redirectParam.startsWith("/") ? redirectParam : "/";

  // Failure-redirect path of the Google OAuth flow (TASK-168): the backend
  // callback funnels every failure (denied consent, unverified email, locked
  // account — deliberately indistinguishable) to /login?oauthError=1.
  const hasOAuthError = Boolean(searchParams.get("oauthError"));

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

  const status = login.error?.response?.status;
  // Every 401 is the same generic "Invalid credentials" — the API deliberately
  // does not distinguish unknown email / wrong password / deactivated account
  // (TASK-274), so there is nothing here to branch on. A deactivated owner is
  // told the truth by email instead (TASK-287); everyone sees the support link
  // below the form.
  const errorMessage =
    status === 401
      ? dict.auth.login.errorInvalid
      : login.isError
        ? dict.common.genericError
        : null;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-1">
        <label
          htmlFor="login-email"
          className="text-sm font-medium text-foreground"
        >
          {dict.auth.login.email}
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          className={fieldClass}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "login-email-error" : undefined}
          {...register("email")}
        />
        {errors.email && (
          <p
            id="login-email-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="login-password"
          className="text-sm font-medium text-foreground"
        >
          {dict.auth.login.password}
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          className={fieldClass}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={
            errors.password ? "login-password-error" : undefined
          }
          {...register("password")}
        />
        {errors.password && (
          <p
            id="login-password-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.password.message}
          </p>
        )}
      </div>

      {/* Password reset (TASK-169). Sheet mode flips to the in-sheet forgot view;
          page mode links to the standalone /forgot-password page. */}
      {onForgotPassword ? (
        <button
          type="button"
          onClick={onForgotPassword}
          className="-mt-1 self-end text-sm font-semibold text-primary transition-colors hover:text-primary/80 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {dict.auth.login.forgot}
        </button>
      ) : (
        <Link
          href="/forgot-password"
          className="-mt-1 self-end text-sm font-semibold text-primary transition-colors hover:text-primary/80 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
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

      <button
        type="submit"
        disabled={login.isPending}
        className="rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition-all hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {login.isPending ? dict.auth.login.submitting : dict.auth.login.submit}
      </button>

      {/* Google is a real redirect-based OAuth flow (TASK-168); Apple remains
          an honest coming-soon stub (owner decision 2026-07-11). */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {dict.auth.login.orDivider}
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="flex gap-2.5">
        <button
          type="button"
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
        </button>
        <button
          type="button"
          onClick={() => toast(dict.auth.login.socialSoon)}
          className={socialClass}
        >
          <AppleIcon />
          {dict.auth.login.apple}
        </button>
      </div>

      {/* Always visible, for everyone (TASK-287). The API can no longer tell a
          user that their account is deactivated, so the form must always offer a
          human route out — it reveals nothing about any account's state. */}
      <p className="text-center text-sm text-muted-foreground">
        {dict.auth.support.loginTrouble}{" "}
        <Link
          href="/contact"
          className="font-semibold text-primary transition-colors hover:text-primary/80 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {dict.auth.support.contactLink}
        </Link>
      </p>

      <p className="text-center text-sm text-muted-foreground">
        {dict.auth.login.noAccount}{" "}
        {onSwitchToRegister ? (
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="font-semibold text-primary transition-colors hover:text-primary/80 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {dict.auth.login.registerLink}
          </button>
        ) : (
          <Link href="/register" className="text-primary hover:underline">
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
