"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth, useAuthControllerRegister } from "@/entities/session";
import { getGetCartQueryKey } from "@/entities/cart";
import { getGetWishlistQueryKey } from "@/entities/wishlist";
import { dict } from "@/shared/config";
// Direct import (not the barrel) — the shared/lib barrel pulls in the JSON-LD
// schema builders, which this client form does not need.
import { passwordSchema } from "@/shared/lib/password-policy";

const registerSchema = z
  .object({
    email: z.string().email(dict.auth.register.validationEmail),
    firstName: z.string().min(1, dict.auth.register.validationFirstName),
    lastName: z.string().min(1, dict.auth.register.validationLastName),
    // Mirrors the API policy (TASK-227): min 8 + lower + upper + digit.
    password: passwordSchema,
    passwordConfirm: z.string(),
    terms: z.boolean().refine((v) => v === true, {
      message: dict.auth.register.validationTerms,
    }),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: dict.auth.register.validationPasswordMatch,
    path: ["passwordConfirm"],
  });

type RegisterValues = z.infer<typeof registerSchema>;

const fieldClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-foreground transition-colors hover:border-muted-foreground/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface RegisterFormProps {
  /**
   * Slide-out mode: called after a successful registration (e.g. to close the
   * auth sheet). When set, the form does NOT navigate.
   */
  onAuthenticated?: () => void;
  /** Slide-out mode: switch to the login tab instead of linking to /login. */
  onSwitchToLogin?: () => void;
}

/** RegisterForm — account creation with zod validation. */
export function RegisterForm({
  onAuthenticated,
  onSwitchToLogin,
}: RegisterFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { isAuthenticated, setTokens } = useAuth();

  const inSheet = Boolean(onAuthenticated);

  // Honour a `?redirect=` param so post-registration navigation returns the user
  // to where they came from (e.g. /checkout). Only same-origin paths are allowed
  // — the leading-slash check prevents open-redirect attacks. Mirrors login-form.
  const redirectParam = searchParams.get("redirect");
  const redirectTarget =
    redirectParam && redirectParam.startsWith("/") ? redirectParam : "/";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  const registerUser = useAuthControllerRegister();

  // Page mode only: already signed in → leave the auth page. In slide-out mode we
  // stay put (the sheet closes itself and the header re-renders in place).
  useEffect(() => {
    if (inSheet) return;
    if (isAuthenticated) {
      router.replace(redirectTarget);
    }
  }, [inSheet, isAuthenticated, router, redirectTarget]);

  const onSubmit = (values: RegisterValues) => {
    registerUser.mutate(
      {
        data: {
          email: values.email,
          password: values.password,
          firstName: values.firstName,
          lastName: values.lastName,
        },
      },
      {
        onSuccess: (res) => {
          // `customInstance` unwraps the Axios layer, so `res` is the API
          // envelope `{ data: { accessToken } }` — the access token lives at
          // `res.data.accessToken` (refresh token is set as an HttpOnly cookie).
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

  const status = registerUser.error?.response?.status;
  const errorMessage =
    status === 409
      ? dict.auth.register.errorConflict
      : registerUser.isError
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
          htmlFor="reg-email"
          className="text-sm font-medium text-foreground"
        >
          {dict.auth.register.email}
        </label>
        <input
          id="reg-email"
          type="email"
          autoComplete="email"
          className={fieldClass}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "reg-email-error" : undefined}
          {...register("email")}
        />
        {errors.email && (
          <p
            id="reg-email-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="reg-first"
            className="text-sm font-medium text-foreground"
          >
            {dict.auth.register.firstName}
          </label>
          <input
            id="reg-first"
            type="text"
            autoComplete="given-name"
            className={fieldClass}
            aria-invalid={errors.firstName ? true : undefined}
            aria-describedby={errors.firstName ? "reg-first-error" : undefined}
            {...register("firstName")}
          />
          {errors.firstName && (
            <p
              id="reg-first-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {errors.firstName.message}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="reg-last"
            className="text-sm font-medium text-foreground"
          >
            {dict.auth.register.lastName}
          </label>
          <input
            id="reg-last"
            type="text"
            autoComplete="family-name"
            className={fieldClass}
            aria-invalid={errors.lastName ? true : undefined}
            aria-describedby={errors.lastName ? "reg-last-error" : undefined}
            {...register("lastName")}
          />
          {errors.lastName && (
            <p
              id="reg-last-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {errors.lastName.message}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="reg-password"
          className="text-sm font-medium text-foreground"
        >
          {dict.auth.register.password}
        </label>
        <input
          id="reg-password"
          type="password"
          autoComplete="new-password"
          className={fieldClass}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "reg-password-error" : undefined}
          {...register("password")}
        />
        {errors.password && (
          <p
            id="reg-password-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.password.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="reg-password-confirm"
          className="text-sm font-medium text-foreground"
        >
          {dict.auth.register.confirmPassword}
        </label>
        <input
          id="reg-password-confirm"
          type="password"
          autoComplete="new-password"
          className={fieldClass}
          aria-invalid={errors.passwordConfirm ? true : undefined}
          aria-describedby={
            errors.passwordConfirm ? "reg-password-confirm-error" : undefined
          }
          {...register("passwordConfirm")}
        />
        {errors.passwordConfirm && (
          <p
            id="reg-password-confirm-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.passwordConfirm.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <input
            id="reg-terms"
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
            aria-invalid={errors.terms ? true : undefined}
            aria-describedby={errors.terms ? "reg-terms-error" : undefined}
            {...register("terms")}
          />
          <span>{dict.auth.register.terms}</span>
        </label>
        {errors.terms && (
          <p
            id="reg-terms-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.terms.message}
          </p>
        )}
      </div>

      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={registerUser.isPending}
        className="rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition-all hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {registerUser.isPending
          ? dict.auth.register.submitting
          : dict.auth.register.submit}
      </button>

      <p className="text-center text-sm text-muted-foreground">
        {dict.auth.register.haveAccount}{" "}
        {onSwitchToLogin ? (
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="font-semibold text-primary transition-colors hover:text-primary/80 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {dict.auth.register.signInLink}
          </button>
        ) : (
          <Link href="/login" className="text-primary hover:underline">
            {dict.auth.register.signInLink}
          </Link>
        )}
      </p>
    </form>
  );
}
