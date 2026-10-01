"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { useAuth, useAuthControllerChangePassword } from "@/entities/session";
import { dict } from "@/shared/config";
// Direct import (not the barrel) — the shared/lib barrel pulls in the JSON-LD
// schema builders, which this client form does not need.
import { customerPasswordSchema } from "@/shared/lib/password-policy";
import { Button } from "@/shared/ui";
import { AuthField } from "./auth-field";

const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, dict.auth.changePassword.validationCurrentRequired),
    // This screen is `/account`, i.e. a shopper's, so it states the shopper
    // policy (TASK-407). `POST /api/auth/password/change` serves the admin panel
    // too and holds an ADMIN/MANAGER to the strict rule server-side, which the
    // admin panel's own form already mirrors.
    newPassword: customerPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: dict.auth.register.validationPasswordMatch,
    path: ["confirmPassword"],
  })
  // Caught here rather than at the API: submitting the same password would
  // still revoke every session, so the user would be signed out everywhere in
  // exchange for nothing.
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: dict.auth.changePassword.validationSameAsCurrent,
    path: ["newPassword"],
  });

type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

/**
 * ChangePasswordForm — change your own password from `/account` (TASK-333).
 *
 * Replaces the "coming soon" toast that stood here while
 * `POST /api/auth/password/change` did not exist.
 *
 * Two things this form must get right:
 *
 * 1. **The current password is required.** The endpoint enforces it (a stolen
 *    access token alone must not be enough to take an account over), and a
 *    wrong one comes back as a 401 — which must read as "that password is
 *    wrong", not as the generic "something went wrong". A user who mistypes
 *    their old password and is told the site is broken will not try again.
 *
 * 2. **Success ends EVERY session, this one included.** `setPassword` calls
 *    `revokeAllUserTokens` and the controller clears the refresh cookie, so the
 *    access token in memory here is the last thing still working and it dies
 *    within 15 minutes. Leaving the user on `/account` would look fine and then
 *    fail at their next action, which is indistinguishable from a bug — so we
 *    sign out deliberately and send them to `/login`. The warning above the
 *    submit button says this BEFORE they commit; other devices going quiet is
 *    the expected outcome, not a surprise.
 */
export function ChangePasswordForm({ onCancel }: { onCancel?: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { clearTokens } = useAuth();
  const changePassword = useAuthControllerChangePassword();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
  });

  const onSubmit = (values: ChangePasswordValues) => {
    changePassword.mutate(
      {
        data: {
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        },
      },
      {
        onSuccess: () => {
          toast.success(dict.auth.changePassword.success);
          // Drop the now-dead credentials and every cached authenticated read
          // before navigating, so nothing renders stale profile data.
          clearTokens();
          queryClient.clear();
          router.push("/login");
        },
      },
    );
  };

  const status = changePassword.error?.response?.status;
  const errorMessage =
    status === 401
      ? dict.auth.changePassword.errorWrongCurrent
      : changePassword.isError
        ? dict.common.genericError
        : null;

  const d = dict.auth.changePassword;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mt-4 flex max-w-md flex-col gap-4"
      noValidate
    >
      <AuthField
        id="change-password-current"
        label={d.currentPassword}
        type="password"
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        {...register("currentPassword")}
      />

      <AuthField
        id="change-password-new"
        label={d.newPassword}
        type="password"
        autoComplete="new-password"
        error={errors.newPassword?.message}
        hint={dict.auth.register.passwordHint}
        {...register("newPassword")}
      />

      <AuthField
        id="change-password-confirm"
        label={d.confirmPassword}
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />

      {/* Not an error — a consequence the user must know about before they
          commit. Styled as a notice, and announced politely so screen-reader
          users meet it at the same point in the form as everyone else. */}
      <p
        className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
        role="note"
      >
        {d.sessionsWarning}
      </p>

      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {/* Same primitives as the auth pages (TASK-871); not full-width here —
            the form sits inside an /account section, beside a cancel action. */}
        <Button
          type="submit"
          disabled={changePassword.isPending}
          className="h-11 rounded-cta px-6 text-base font-semibold"
        >
          {changePassword.isPending ? d.submitting : d.submit}
        </Button>

        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={changePassword.isPending}
            className="h-11 rounded-cta px-4 text-base text-muted-foreground hover:text-foreground"
          >
            {d.cancel}
          </Button>
        )}
      </div>
    </form>
  );
}
