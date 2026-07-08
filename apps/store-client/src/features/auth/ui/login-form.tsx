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

/**
 * Extract `message` from the API error envelope
 * (`{ statusCode, error, message }`) without trusting the response shape —
 * returns "" for anything unexpected.
 */
function getErrorEnvelopeMessage(data: unknown): string {
  if (typeof data !== "object" || data === null) return "";
  const message = (data as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}

type LoginValues = z.infer<typeof loginSchema>;

const fieldClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-foreground transition-colors hover:border-muted-foreground/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const socialClass =
  "flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-background text-sm font-medium text-foreground transition-all hover:border-primary/40 hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]";

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
  // A 401 is either bad credentials or a deactivated (banned) account — the
  // API distinguishes them only by the error-envelope `message` ("Account is
  // deactivated"). Read it defensively: the generated error type carries no
  // body shape, and matching is case-insensitive contains (TASK-202).
  const isDeactivated =
    status === 401 &&
    getErrorEnvelopeMessage(login.error?.response?.data)
      .toLowerCase()
      .includes("deactivated");
  const errorMessage = isDeactivated
    ? dict.auth.login.errorDeactivated
    : status === 401
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
          {...register("email")}
        />
        {errors.email && (
          <p role="alert" className="text-sm text-destructive">
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
          {...register("password")}
        />
        {errors.password && (
          <p role="alert" className="text-sm text-destructive">
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
          className="-mt-1 cursor-pointer self-end text-sm font-semibold text-primary transition-colors hover:text-primary/80 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

      <button
        type="submit"
        disabled={login.isPending}
        className="cursor-pointer rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition-all hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {login.isPending ? dict.auth.login.submitting : dict.auth.login.submit}
      </button>

      {/* Social sign-in has no backend yet — buttons are stubbed (TASK-168). */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {dict.auth.login.orDivider}
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => toast(dict.auth.login.socialSoon)}
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

      <p className="text-center text-sm text-muted-foreground">
        {dict.auth.login.noAccount}{" "}
        {onSwitchToRegister ? (
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="cursor-pointer font-semibold text-primary transition-colors hover:text-primary/80 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
