"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthControllerConfirmPasswordReset } from "@/entities/session";
import { dict } from "@/shared/config";
// Direct import (not the barrel) — the shared/lib barrel pulls in the JSON-LD
// schema builders, which this client form does not need.
import { passwordSchema } from "@/shared/lib/password-policy";

const resetSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: dict.auth.register.validationPasswordMatch,
    path: ["confirmPassword"],
  });

type ResetValues = z.infer<typeof resetSchema>;

const fieldClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-foreground transition-colors hover:border-muted-foreground/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * ResetPasswordForm — set a new password from an emailed single-use link.
 *
 * Reads the opaque token from `?token=`. If it is missing the form is not
 * rendered (an error state is shown instead) so an empty token is never
 * submitted. On success the user is sent to /login to re-authenticate — the
 * backend has just revoked every existing session, so we never auto-login here.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const confirmReset = useAuthControllerConfirmPasswordReset();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetValues>({ resolver: zodResolver(resetSchema) });

  // No token → the link is incomplete. Show an error state, never submit.
  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-sm text-destructive">
          {dict.auth.resetPassword.errorMissingToken}
        </p>
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-primary hover:underline">
            {dict.auth.resetPassword.backToLogin}
          </Link>
        </p>
      </div>
    );
  }

  const onSubmit = (values: ResetValues) => {
    confirmReset.mutate(
      { data: { token, newPassword: values.newPassword } },
      {
        onSuccess: () => router.push("/login"),
      },
    );
  };

  const status = confirmReset.error?.response?.status;
  const errorMessage =
    status === 401
      ? dict.auth.resetPassword.errorInvalidToken
      : confirmReset.isError
        ? dict.common.genericError
        : null;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <p className="text-sm text-muted-foreground">
        {dict.auth.resetPassword.description}
      </p>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="reset-password"
          className="text-sm font-medium text-foreground"
        >
          {dict.auth.resetPassword.newPassword}
        </label>
        <input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          className={fieldClass}
          aria-invalid={errors.newPassword ? true : undefined}
          aria-describedby={
            errors.newPassword ? "reset-password-error" : undefined
          }
          {...register("newPassword")}
        />
        {errors.newPassword && (
          <p
            id="reset-password-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.newPassword.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="reset-password-confirm"
          className="text-sm font-medium text-foreground"
        >
          {dict.auth.resetPassword.confirmPassword}
        </label>
        <input
          id="reset-password-confirm"
          type="password"
          autoComplete="new-password"
          className={fieldClass}
          aria-invalid={errors.confirmPassword ? true : undefined}
          aria-describedby={
            errors.confirmPassword ? "reset-password-confirm-error" : undefined
          }
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p
            id="reset-password-confirm-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.confirmPassword.message}
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
        disabled={confirmReset.isPending}
        className="rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition-all hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {confirmReset.isPending
          ? dict.auth.resetPassword.submitting
          : dict.auth.resetPassword.submit}
      </button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-primary hover:underline">
          {dict.auth.resetPassword.backToLogin}
        </Link>
      </p>
    </form>
  );
}
