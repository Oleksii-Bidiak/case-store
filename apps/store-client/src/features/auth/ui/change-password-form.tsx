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

const fieldClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-foreground transition-colors hover:border-muted-foreground/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
      <div className="flex flex-col gap-1">
        <label
          htmlFor="change-password-current"
          className="text-sm font-medium text-foreground"
        >
          {d.currentPassword}
        </label>
        <input
          id="change-password-current"
          type="password"
          autoComplete="current-password"
          className={fieldClass}
          aria-invalid={errors.currentPassword ? true : undefined}
          aria-describedby={
            errors.currentPassword ? "change-password-current-error" : undefined
          }
          {...register("currentPassword")}
        />
        {errors.currentPassword && (
          <p
            id="change-password-current-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.currentPassword.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="change-password-new"
          className="text-sm font-medium text-foreground"
        >
          {d.newPassword}
        </label>
        <input
          id="change-password-new"
          type="password"
          autoComplete="new-password"
          className={fieldClass}
          aria-invalid={errors.newPassword ? true : undefined}
          aria-describedby={
            errors.newPassword ? "change-password-new-error" : undefined
          }
          {...register("newPassword")}
        />
        {errors.newPassword && (
          <p
            id="change-password-new-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.newPassword.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="change-password-confirm"
          className="text-sm font-medium text-foreground"
        >
          {d.confirmPassword}
        </label>
        <input
          id="change-password-confirm"
          type="password"
          autoComplete="new-password"
          className={fieldClass}
          aria-invalid={errors.confirmPassword ? true : undefined}
          aria-describedby={
            errors.confirmPassword ? "change-password-confirm-error" : undefined
          }
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p
            id="change-password-confirm-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

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
        <button
          type="submit"
          disabled={changePassword.isPending}
          className="rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition-all hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-99 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {changePassword.isPending ? d.submitting : d.submit}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={changePassword.isPending}
            className="rounded-lg px-4 py-2.5 font-medium text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {d.cancel}
          </button>
        )}
      </div>
    </form>
  );
}
