"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth, useAuthControllerRegister } from "@/entities/session";
import { getGetCartQueryKey } from "@/entities/cart";
import { getGetWishlistQueryKey } from "@/entities/wishlist";
import { dict, LEGAL_OFFER_PATH, LEGAL_PRIVACY_PATH } from "@/shared/config";
// Direct import (not the barrel) — the shared/lib barrel pulls in the JSON-LD
// schema builders, which this client form does not need.
import { customerPasswordSchema } from "@/shared/lib/password-policy";
import { apiErrorStatus } from "@/shared/lib/api-error";
import { EMAIL_MAX_LENGTH, emailField } from "@/shared/lib/form-fields";
import {
  applyServerFieldErrors,
  readFieldErrors,
} from "@/shared/lib/form-errors";
import { Button, Honeypot } from "@/shared/ui";
import { sanitizeRedirectTarget } from "../lib/sanitize-redirect-target";
import { AUTH_LINK_CLASS, AUTH_SUBMIT_CLASS, AuthField } from "./auth-field";

/**
 * The registration honeypot's field — `RegisterDto.hpCheck` (TASK-749).
 * Meaningless on purpose: a semantic name like the contact form's `website` is
 * a slot password managers autofill, and a filled trap means no account.
 */
const REGISTER_HONEYPOT_FIELD = "hpCheck";

/** Mirrors `RegisterDto`'s `@MaxLength(100)` on both names (`apps/store-api/src/auth/dto/register.dto.ts`). */
const REGISTER_NAME_MAX = 100;

/** `RegisterDto` path → form field (the names are the same). */
const REGISTER_FIELD_MAP = {
  email: "email",
  firstName: "firstName",
  lastName: "lastName",
  password: "password",
};

/**
 * A name: trimmed, capped at the DTO's 100. REQUIRED here although `RegisterDto`
 * makes both names optional — stricter on purpose (forms Rule 5f): the
 * storefront sign-up has always asked for a name so the cabinet and the admin's
 * customer list have one to show; the DTO stays optional, which this form never
 * relies on. `"   "` is refused (trimmed), the 101st character too.
 */
function nameField(requiredMessage: string) {
  return z
    .string()
    .trim()
    .min(1, requiredMessage)
    .max(REGISTER_NAME_MAX, dict.forms.tooLong);
}

const registerSchema = z
  .object({
    // The one email rule (forms Rule 5c), as `RegisterDto`.
    email: emailField({ message: dict.auth.register.validationEmail }),
    firstName: nameField(dict.auth.register.validationFirstName),
    lastName: nameField(dict.auth.register.validationLastName),
    // Mirrors the API shopper policy (TASK-407): min 8 + a letter + a digit.
    password: customerPasswordSchema,
    passwordConfirm: z.string(),
    terms: z.boolean().refine((v) => v === true, {
      message: dict.auth.register.validationTerms,
    }),
    // Honeypot (TASK-749). NO rule, for the reason in
    // `widgets/contact/model/contact-schema.ts`: a blocking rule on a field
    // nothing renders an error for makes the submit button silently do nothing.
    hpCheck: z.string().optional(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: dict.auth.register.validationPasswordMatch,
    path: ["passwordConfirm"],
  });

type RegisterValues = z.infer<typeof registerSchema>;

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
  // to where they came from (e.g. /checkout). Only same-origin paths survive the
  // sanitizer. Mirrors login-form.
  const redirectTarget = sanitizeRedirectTarget(searchParams.get("redirect"));

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  // The last failure is shown under a field — no banner then (Rule 6c).
  const [onField, setOnField] = useState(false);

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
          // Only a bot fills the trap; a person's request carries no key.
          // Clamped to the DTO's 255 — the schema deliberately has no rule.
          hpCheck: values.hpCheck?.slice(0, 255) || undefined,
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
        onError: (error) => {
          // Field-specific refusals go under their field (forms Rule 6b): the
          // 409 "already registered" under the email, a DTO 400 wherever
          // `fieldErrors` points. Only the rest becomes the banner.
          if (apiErrorStatus(error) === 409) {
            setError("email", {
              type: "server",
              message: dict.auth.register.errorConflict,
            });
            setOnField(true);
            return;
          }
          const passwordConstraint = readFieldErrors(error).find(
            (entry) => entry.field === "password",
          )?.constraint;
          const { mapped, unmapped } = applyServerFieldErrors(
            error,
            setError,
            REGISTER_FIELD_MAP,
            {
              // Email and names: the localized default by constraint.
              password:
                passwordConstraint === "minLength"
                  ? dict.auth.register.validationPassword
                  : dict.auth.register.validationPasswordPolicy,
            },
          );
          setOnField(mapped.length > 0 && unmapped.length === 0);
        },
      },
    );
  };

  const d = dict.auth.register;

  const errorMessage =
    registerUser.isError && !onField ? dict.common.genericError : null;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <AuthField
        id="reg-email"
        label={d.email}
        type="email"
        autoComplete="email"
        maxLength={EMAIL_MAX_LENGTH}
        error={errors.email?.message}
        {...register("email")}
      />

      {/* One column on phones (TASK-871): two ~150px inputs on a 390 screen
          clipped longer Ukrainian surnames and their error lines. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <AuthField
          id="reg-first"
          label={d.firstName}
          type="text"
          autoComplete="given-name"
          maxLength={REGISTER_NAME_MAX}
          error={errors.firstName?.message}
          {...register("firstName")}
        />
        <AuthField
          id="reg-last"
          label={d.lastName}
          type="text"
          autoComplete="family-name"
          maxLength={REGISTER_NAME_MAX}
          error={errors.lastName?.message}
          {...register("lastName")}
        />
      </div>

      <AuthField
        id="reg-password"
        label={d.password}
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        hint={d.passwordHint}
        {...register("password")}
      />

      <AuthField
        id="reg-password-confirm"
        label={d.confirmPassword}
        type="password"
        autoComplete="new-password"
        error={errors.passwordConfirm?.message}
        {...register("passwordConfirm")}
      />

      {/* TASK-749: bot trap. `sr-only` is absolutely positioned, so it takes no
          place in this flex column — nothing on screen moves. */}
      <Honeypot
        label={d.honeypotLabel}
        {...register(REGISTER_HONEYPOT_FIELD)}
      />

      {/* Consent (TASK-871): the documents are named AND linked, so the person
          can read what they agree to. The links sit outside the <label> — a
          link inside a label is a second click target on one control, and a
          mis-tap on it would tick the box instead of opening the document. They
          open in a new tab so the half-filled form survives the visit. */}
      <div className="flex flex-col gap-1">
        <div className="flex items-start gap-2.5 text-sm text-muted-foreground">
          <input
            id="reg-terms"
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
            aria-invalid={errors.terms ? true : undefined}
            aria-describedby={
              errors.terms ? "reg-terms-docs reg-terms-error" : "reg-terms-docs"
            }
            {...register("terms")}
          />
          <p>
            <label
              htmlFor="reg-terms"
              className="cursor-pointer transition-colors hover:text-foreground"
            >
              {d.consentPrefix}
            </label>{" "}
            <span id="reg-terms-docs">
              <Link
                href={LEGAL_OFFER_PATH}
                target="_blank"
                rel="noopener noreferrer"
                className={AUTH_LINK_CLASS}
              >
                {d.consentOfferLink}
                <span className="sr-only"> {d.consentNewTab}</span>
              </Link>
              {d.consentAnd}
              <Link
                href={LEGAL_PRIVACY_PATH}
                target="_blank"
                rel="noopener noreferrer"
                className={AUTH_LINK_CLASS}
              >
                {d.consentPrivacyLink}
                <span className="sr-only"> {d.consentNewTab}</span>
              </Link>
            </span>
          </p>
        </div>
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

      <Button
        type="submit"
        disabled={registerUser.isPending}
        className={AUTH_SUBMIT_CLASS}
      >
        {registerUser.isPending ? d.submitting : d.submit}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {d.haveAccount}{" "}
        {onSwitchToLogin ? (
          <button
            type="button"
            onClick={onSwitchToLogin}
            className={AUTH_LINK_CLASS}
          >
            {d.signInLink}
          </button>
        ) : (
          <Link href="/login" className={AUTH_LINK_CLASS}>
            {d.signInLink}
          </Link>
        )}
      </p>
    </form>
  );
}
