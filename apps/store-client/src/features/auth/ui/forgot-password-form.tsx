"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthControllerRequestPasswordReset } from "@/entities/session";
import { dict } from "@/shared/config";

const forgotSchema = z.object({
  email: z.string().email(dict.auth.forgotPassword.validationEmail),
});

type ForgotValues = z.infer<typeof forgotSchema>;

const fieldClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-foreground transition-colors hover:border-muted-foreground/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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

  const backToLogin = onSwitchToLogin ? (
    <button
      type="button"
      onClick={onSwitchToLogin}
      className="font-semibold text-primary transition-colors hover:text-primary/80 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {dict.auth.forgotPassword.backToLogin}
    </button>
  ) : (
    <Link href="/login" className="text-primary hover:underline">
      {dict.auth.forgotPassword.backToLogin}
    </Link>
  );

  if (submitted) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm text-foreground">
          {dict.auth.forgotPassword.success}
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
      <p className="text-sm text-muted-foreground">
        {dict.auth.forgotPassword.description}
      </p>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="forgot-email"
          className="text-sm font-medium text-foreground"
        >
          {dict.auth.forgotPassword.email}
        </label>
        <input
          id="forgot-email"
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

      <button
        type="submit"
        disabled={requestReset.isPending}
        className="rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition-all hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {requestReset.isPending
          ? dict.auth.forgotPassword.submitting
          : dict.auth.forgotPassword.submit}
      </button>

      <p className="text-center text-sm text-muted-foreground">{backToLogin}</p>
    </form>
  );
}
