"use client";

import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNewsletterControllerSubscribe } from "@/entities/newsletter";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { trackEvent } from "@/shared/lib";
import { EMAIL_MAX_LENGTH } from "@/shared/lib/form-fields";
import {
  applyServerFieldErrors,
  readFieldErrors,
} from "@/shared/lib/form-errors";
import {
  newsletterSchema,
  type NewsletterFormValues,
} from "../model/newsletter-schema";

/** `SubscribeDto` path → form field; `source` is the host's, not typed. */
const NEWSLETTER_FIELD_MAP = { email: "email" };

interface NewsletterSubscribeFormProps {
  /** Attribution tag persisted with the subscription (e.g. "home", "promo"). */
  source?: string;
  /** Extra classes for the <form> wrapper. */
  className?: string;
  /** Extra classes for the email <input> (host blocks tune height/radius). */
  inputClassName?: string;
  /** Extra classes for the submit <button>. */
  buttonClassName?: string;
}

/**
 * NewsletterSubscribeForm — reusable email opt-in (features layer). Posts to the
 * public /newsletter/subscribe endpoint via the generated Orval mutation. The
 * backend is idempotent, so a repeat email is still a success. Handles pending,
 * success (aria-live status), and error (incl. 429 rate-limit) states, with zod
 * email validation. Styling defaults use design tokens; hosts may pass class
 * overrides to match their block.
 */
export function NewsletterSubscribeForm({
  source,
  className,
  inputClassName,
  buttonClassName,
}: NewsletterSubscribeFormProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const statusId = useId();
  const subscribe = useNewsletterControllerSubscribe();
  // True when the last refusal now lives under the input (forms Rule 6c).
  const [onField, setOnField] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<NewsletterFormValues>({
    resolver: zodResolver(newsletterSchema),
    defaultValues: { email: "" },
  });

  const succeeded = subscribe.isSuccess;

  const onSubmit = (values: NewsletterFormValues) => {
    setOnField(false);
    subscribe.mutate(
      { data: { email: values.email, source } },
      {
        onSuccess: () => {
          reset({ email: "" });
          // Analytics: report the subscription, tagged with the form's optional
          // attribution source when present.
          trackEvent("newsletter_subscribe", source ? { source } : undefined);
        },
        // TASK-1984 (Rule 6b): a 400 about the email goes under the input with
        // the form's own sentence. A refusal about the host's `source` tag is
        // not the subscriber's to fix — it stays the generic line.
        onError: (error) => {
          // The sentence follows the constraint, as the schema's does: a
          // too-long address is «задовге», not «некоректна пошта».
          const tooLong = readFieldErrors(error).some(
            (entry) =>
              entry.field === "email" && entry.constraint === "maxLength",
          );
          const { mapped, unmapped } = applyServerFieldErrors(
            error,
            setError,
            NEWSLETTER_FIELD_MAP,
            tooLong ? {} : { email: dict.newsletterForm.invalidEmail },
          );
          setOnField(mapped.length > 0 && unmapped.length === 0);
        },
      },
    );
  };

  // The field's own error (zod or a mapped 400) lives under the input; the
  // request outcome (429 → its own copy, anything else → the generic error, or
  // the success line) lives in the status region below it.
  const fieldError = errors.email?.message;
  const requestError =
    !fieldError && subscribe.isError && !onField
      ? subscribe.error?.response?.status === 429
        ? dict.newsletterForm.rateLimited
        : dict.newsletterForm.error
      : null;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={cn("flex w-full flex-col gap-2", className)}
      noValidate
    >
      {/* Stacked under `sm`, side by side above it (TASK-410). An email input's
          intrinsic width is ~180px and the submit label never wraps, so the old
          single row could not fit a 320px screen: `flex-1` alone does not let a
          flex item shrink below that intrinsic width — hence `min-w-0` on the
          input for the row layout, and the column layout for the narrowest. */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor={inputId} className="sr-only">
          {dict.newsletterForm.emailLabel}
        </label>
        <input
          id={inputId}
          type="email"
          autoComplete="email"
          maxLength={EMAIL_MAX_LENGTH}
          placeholder={dict.newsletterForm.placeholder}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? `${errorId} ${statusId}` : statusId}
          {...register("email")}
          className={cn(
            "h-12 w-full min-w-0 rounded-xl border border-border bg-background px-4 text-sm text-foreground outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring sm:flex-1",
            inputClassName,
          )}
        />
        <button
          type="submit"
          disabled={subscribe.isPending}
          aria-busy={subscribe.isPending || undefined}
          className={cn(
            "h-12 shrink-0 rounded-xl bg-primary px-6 text-sm font-bold whitespace-nowrap text-primary-foreground transition-interactive hover:bg-primary-hover hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring active:scale-98 active:bg-primary active:shadow-none disabled:cursor-progress disabled:hover:bg-primary disabled:hover:shadow-none disabled:active:scale-100 motion-reduce:active:scale-100",
            buttonClassName,
          )}
        >
          {subscribe.isPending
            ? dict.newsletterForm.pending
            : dict.newsletterForm.submit}
        </button>
      </div>

      {/* The field error under the input (forms Rule 6a). */}
      {fieldError && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {fieldError}
        </p>
      )}

      {/* Polite live region for the request: success or a field-less error.
          It keeps its line reserved while empty, and steps aside (sr-only)
          while the field error holds that line. */}
      <p
        id={statusId}
        role={requestError ? "alert" : "status"}
        aria-live="polite"
        className={cn(
          "text-xs",
          fieldError ? "sr-only" : "min-h-[1.25rem]",
          requestError ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {requestError ?? (succeeded ? dict.newsletterForm.success : "")}
      </p>
    </form>
  );
}
