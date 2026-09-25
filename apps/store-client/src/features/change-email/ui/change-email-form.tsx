"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRequestEmailChange } from "@/entities/session";
import { dict } from "@/shared/config";
import { apiErrorStatus } from "@/shared/lib/api-error";
import { Button } from "@/shared/ui";
import {
  buildChangeEmailSchema,
  type ChangeEmailValues,
} from "../model/change-email-schema";

const fieldClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-foreground transition-colors hover:border-muted-foreground/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface ChangeEmailFormProps {
  /** The account's current sign-in address. */
  currentEmail: string;
  onCancel?: () => void;
}

/**
 * ChangeEmailForm — ask to sign in with a different address (TASK-396).
 *
 * The one thing this form must not do is look like it changed anything. The
 * API changes NOTHING on submit: it mails a link to the new address and a
 * warning (with a way back) to the current one, and the login moves only when
 * the new inbox clicks. So success is a "check your new inbox" state that
 * names the address, not a toast saying "saved" — a shopper told "saved" would
 * try to sign in with the new address and be refused.
 *
 * The session stays as it is until then; the confirm page ends it.
 */
export function ChangeEmailForm({
  currentEmail,
  onCancel,
}: ChangeEmailFormProps) {
  const d = dict.auth.changeEmail;
  const schema = useMemo(
    () => buildChangeEmailSchema(currentEmail),
    [currentEmail],
  );
  const request = useRequestEmailChange();
  const [sentTo, setSentTo] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangeEmailValues>({ resolver: zodResolver(schema) });

  const onSubmit = (values: ChangeEmailValues) => {
    request.mutate(
      {
        data: {
          newEmail: values.newEmail,
          currentPassword: values.currentPassword,
        },
      },
      { onSuccess: () => setSentTo(values.newEmail) },
    );
  };

  if (sentTo) {
    return (
      <div role="status" className="mt-4 flex max-w-md flex-col gap-2">
        <p className="text-sm font-semibold text-foreground">{d.sentHeading}</p>
        <p className="text-sm text-muted-foreground">{d.sentBody(sentTo)}</p>
      </div>
    );
  }

  const status = apiErrorStatus(request.error);
  const errorMessage = !request.isError
    ? null
    : status === 401
      ? d.errorWrongPassword
      : status === 409
        ? d.errorTaken
        : status === 429
          ? d.errorTooMany
          : dict.common.genericError;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mt-4 flex max-w-md flex-col gap-4"
      noValidate
      aria-label={d.heading}
    >
      <p className="text-sm text-muted-foreground">{d.intro}</p>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="change-email-new"
          className="text-sm font-medium text-foreground"
        >
          {d.newEmail}
        </label>
        <input
          id="change-email-new"
          type="email"
          autoComplete="email"
          className={fieldClass}
          aria-invalid={errors.newEmail ? true : undefined}
          aria-describedby={
            errors.newEmail ? "change-email-new-error" : undefined
          }
          {...register("newEmail")}
        />
        {errors.newEmail && (
          <p
            id="change-email-new-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.newEmail.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="change-email-password"
          className="text-sm font-medium text-foreground"
        >
          {d.currentPassword}
        </label>
        <input
          id="change-email-password"
          type="password"
          autoComplete="current-password"
          className={fieldClass}
          aria-invalid={errors.currentPassword ? true : undefined}
          aria-describedby={
            errors.currentPassword ? "change-email-password-error" : undefined
          }
          {...register("currentPassword")}
        />
        {errors.currentPassword && (
          <p
            id="change-email-password-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.currentPassword.message}
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{d.sessionsWarning}</p>

      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={request.isPending}>
          {request.isPending ? d.submitting : d.submit}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            {d.cancel}
          </Button>
        )}
      </div>
    </form>
  );
}
