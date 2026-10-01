"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthControllerRequestPasswordReset } from "@/entities/session";
import { dict } from "@/shared/config";
import { apiErrorStatus } from "@/shared/lib";
import { Button } from "@/shared/ui";
import { AUTH_LINK_CLASS, AUTH_SUBMIT_CLASS, AuthField } from "./auth-field";

const forgotSchema = z.object({
  email: z.string().email(dict.auth.forgotPassword.validationEmail),
});

type ForgotValues = z.infer<typeof forgotSchema>;

interface ForgotPasswordFormProps {
  /** Slide-out mode: switch back to the login view instead of linking to /login. */
  onSwitchToLogin?: () => void;
}

/**
 * ForgotPasswordForm — request a password-reset link by email.
 *
 * Security: the backend intentionally returns the SAME generic 200 for a
 * registered and an unknown email (existence-hiding). This form must never
 * undermine that — on ANY success it shows one fixed "check your email" state
 * and never branches on the response content or a 404.
 *
 * Failures are a different matter (TASK-871): they used to vanish, leaving a
 * button that did nothing. A 429 is the IP throttle and anything else is the
 * network or the API — neither depends on the address, so naming them leaks
 * nothing about any account.
 */
export function ForgotPasswordForm({
  onSwitchToLogin,
}: ForgotPasswordFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const requestReset = useAuthControllerRequestPasswordReset();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema) });

  const onSubmit = (values: ForgotValues) => {
    requestReset.mutate(
      { data: values },
      {
        // Always show the generic success — never reveal whether the email exists.
        onSuccess: () => setSubmitted(true),
      },
    );
  };

  const d = dict.auth.forgotPassword;

  const errorMessage = requestReset.isError
    ? apiErrorStatus(requestReset.error) === 429
      ? d.errorTooMany
      : d.errorNetwork
    : null;

  const backToLogin = onSwitchToLogin ? (
    <button type="button" onClick={onSwitchToLogin} className={AUTH_LINK_CLASS}>
      {d.backToLogin}
    </button>
  ) : (
    <Link href="/login" className={AUTH_LINK_CLASS}>
      {d.backToLogin}
    </Link>
  );

  if (submitted) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm text-foreground">
          {d.success}
        </p>
        <p className="text-center text-sm text-muted-foreground">
          {backToLogin}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <p className="text-sm text-muted-foreground">{d.description}</p>

      <AuthField
        id="forgot-email"
        label={d.email}
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />

      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <Button
        type="submit"
        disabled={requestReset.isPending}
        className={AUTH_SUBMIT_CLASS}
      >
        {requestReset.isPending ? d.submitting : d.submit}
      </Button>

      <p className="text-center text-sm text-muted-foreground">{backToLogin}</p>
    </form>
  );
}
