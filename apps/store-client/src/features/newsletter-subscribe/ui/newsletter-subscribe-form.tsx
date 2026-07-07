"use client";

import { useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNewsletterControllerSubscribe } from "@/entities/newsletter";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { trackEvent } from "@/shared/lib";
import {
  newsletterSchema,
  type NewsletterFormValues,
} from "../model/newsletter-schema";

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
  const statusId = useId();
  const subscribe = useNewsletterControllerSubscribe();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NewsletterFormValues>({
    resolver: zodResolver(newsletterSchema),
    defaultValues: { email: "" },
  });

  const succeeded = subscribe.isSuccess;

  const onSubmit = (values: NewsletterFormValues) => {
    subscribe.mutate(
      { data: { email: values.email, source } },
      {
        onSuccess: () => {
          reset({ email: "" });
          // Analytics: report the subscription, tagged with the form's optional
          // attribution source when present.
          trackEvent("newsletter_subscribe", source ? { source } : undefined);
        },
      },
    );
  };

  // Prefer the inline zod error; otherwise map the mutation failure (429 → a
  // dedicated rate-limit message, anything else → the generic error).
  const errorMessage = errors.email
    ? errors.email.message
    : subscribe.isError
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
      <div className="flex gap-2.5">
        <label htmlFor={inputId} className="sr-only">
          {dict.newsletterForm.emailLabel}
        </label>
        <input
          id={inputId}
          type="email"
          autoComplete="email"
          placeholder={dict.newsletterForm.placeholder}
          aria-invalid={errorMessage ? true : undefined}
          aria-describedby={statusId}
          {...register("email")}
          className={cn(
            "h-12 flex-1 rounded-xl border border-border bg-background px-4 text-sm text-foreground outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring",
            inputClassName,
          )}
        />
        <button
          type="submit"
          disabled={subscribe.isPending}
          className={cn(
            "h-12 rounded-xl bg-primary px-6 text-sm font-bold whitespace-nowrap text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
            buttonClassName,
          )}
        >
          {subscribe.isPending
            ? dict.newsletterForm.pending
            : dict.newsletterForm.submit}
        </button>
      </div>

      {/* Single polite live region: announces success or surfaces an error. */}
      <p
        id={statusId}
        role={errorMessage ? "alert" : "status"}
        aria-live="polite"
        className={cn(
          "min-h-[1.25rem] text-xs",
          errorMessage ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {errorMessage ?? (succeeded ? dict.newsletterForm.success : "")}
      </p>
    </form>
  );
}
