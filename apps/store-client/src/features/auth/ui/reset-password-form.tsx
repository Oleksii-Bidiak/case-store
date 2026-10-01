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
import { customerPasswordSchema } from "@/shared/lib/password-policy";
import { Button } from "@/shared/ui";
import { PASSWORD_RESET_DONE_PARAM } from "../lib/password-reset-done";
import { AUTH_LINK_CLASS, AUTH_SUBMIT_CLASS, AuthField } from "./auth-field";

const resetSchema = z
  .object({
    // Shopper policy (TASK-407). A staff member resetting through this same
    // emailed-link flow is still held to the strict rule server-side.
    newPassword: customerPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: dict.auth.register.validationPasswordMatch,
    path: ["confirmPassword"],
  });

type ResetValues = z.infer<typeof resetSchema>;

/** Where a successful reset lands: the login page, told to say so (TASK-871). */
const LOGIN_AFTER_RESET = `/login?${PASSWORD_RESET_DONE_PARAM}=1`;

/**
 * ResetPasswordForm — set a new password from an emailed single-use link.
 *
 * Reads the opaque token from `?token=`. If it is missing the form is not
 * rendered (an error state is shown instead) so an empty token is never
 * submitted. On success the user is sent to /login to re-authenticate — the
 * backend has just revoked every existing session, so we never auto-login here.
 * The login page reads the flag on that URL and confirms the change; it used to
 * land there with no word that anything had happened.
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

  const d = dict.auth.resetPassword;

  const backToLogin = (
    <p className="text-center text-sm text-muted-foreground">
      <Link href="/login" className={AUTH_LINK_CLASS}>
        {d.backToLogin}
      </Link>
    </p>
  );

  // No token → the link is incomplete. Show an error state, never submit.
  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-sm text-destructive">
          {d.errorMissingToken}
        </p>
        {backToLogin}
      </div>
    );
  }

  const onSubmit = (values: ResetValues) => {
    confirmReset.mutate(
      { data: { token, newPassword: values.newPassword } },
      {
        onSuccess: () => router.push(LOGIN_AFTER_RESET),
      },
    );
  };

  const status = confirmReset.error?.response?.status;
  const tokenRejected = status === 401;
  const errorMessage = tokenRejected
    ? d.errorInvalidToken
    : confirmReset.isError
      ? dict.common.genericError
      : null;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <p className="text-sm text-muted-foreground">{d.description}</p>

      <AuthField
        id="reset-password"
        label={d.newPassword}
        type="password"
        autoComplete="new-password"
        error={errors.newPassword?.message}
        hint={dict.auth.register.passwordHint}
        {...register("newPassword")}
      />

      <AuthField
        id="reset-password-confirm"
        label={d.confirmPassword}
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />

      {errorMessage && (
        <div className="flex flex-col gap-1">
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
          {/* A rejected link cannot be retried — the way forward is a new one. */}
          {tokenRejected && (
            <Link
              href="/forgot-password"
              className={`self-start text-sm ${AUTH_LINK_CLASS}`}
            >
              {d.requestNewLink}
            </Link>
          )}
        </div>
      )}

      <Button
        type="submit"
        disabled={confirmReset.isPending}
        className={AUTH_SUBMIT_CLASS}
      >
        {confirmReset.isPending ? d.submitting : d.submit}
      </Button>

      {backToLogin}
    </form>
  );
}
