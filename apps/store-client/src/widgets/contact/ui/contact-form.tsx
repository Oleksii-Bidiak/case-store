"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CONTACT_FIELD_MAP,
  CONTACT_HONEYPOT_FIELD,
  CONTACT_LIMITS,
  ContactHoneypot,
  contactRetryAfterMinutes,
  contactServerFieldMessages,
  contactSubmitErrorKind,
  useContactControllerSubmit,
} from "@/entities/contact";
import { dict } from "@/shared/config";
import { EMAIL_MAX_LENGTH } from "@/shared/lib/form-fields";
import { applyServerFieldErrors } from "@/shared/lib/form-errors";
import { Button, PhoneInput } from "@/shared/ui";
import { contactSchema, type ContactFormValues } from "../model/contact-schema";

const FIELD =
  "h-[46px] rounded-xl border-[1.5px] border-border bg-background px-[15px] text-base text-foreground outline-none focus-visible:border-primary md:text-sm";
// TASK-1984 (forms Rule 5b): the phone is the shared `PhoneInput` — the one
// input that draws the UA mask and emits the sanitised raw value. Its `Input`
// base look is merged away (`cn` is tailwind-merge) so it matches its siblings.
const PHONE_FIELD = `${FIELD} shadow-none hover:border-border focus-visible:ring-0 dark:bg-background`;
const LABEL = "text-[13px] font-semibold text-foreground";
const ERROR = "text-xs font-medium text-destructive";
const L = CONTACT_LIMITS;

/**
 * ContactForm — the "Напишіть нам" message form. Submits to `POST /api/contact`
 * via the generated Orval mutation hook (react-hook-form + zod validation that
 * mirrors the backend DTO). On success it swaps to a confirmation panel; a
 * failed request (network / 429 rate-limit / validation) surfaces a friendly UA
 * error without losing the entered values.
 *
 * TASK-1984 (forms Rule 6): every field error is a `<p id="…-error"
 * role="alert">` under its field, OUTSIDE the `<label>` (inside it the error
 * became part of the field's accessible name). A server 400 lands on the field
 * it names; the banner is only for what no field takes.
 */
export function ContactForm() {
  const d = dict.contact;
  const submit = useContactControllerSubmit();
  // True when the last refusal now lives under the fields it is about, so the
  // banner must not say it a second time (forms Rule 6c).
  const [onField, setOnField] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    reset,
    formState: { errors },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      topic: d.topics[0].key,
      name: "",
      phone: "",
      email: "",
      orderRef: "",
      message: "",
      consent: false,
      website: "",
    },
  });

  // `useWatch` (not `watch()`) keeps the component memoizable under the React
  // Compiler while still re-rendering the topic row as the selection changes.
  const topic = useWatch({ control, name: "topic" });

  const onSubmit = (values: ContactFormValues) => {
    setOnField(false);
    submit.mutate(
      {
        data: {
          name: values.name,
          phone: values.phone,
          email: values.email,
          message: values.message,
          topic: values.topic || undefined,
          orderRef: values.orderRef?.trim() ? values.orderRef : undefined,
          // Only a bot fills the honeypot; a person's request carries no key.
          // Clamped to the DTO's 255, because the schema deliberately does not
          // validate it — see `contact-schema.ts`.
          website: values.website?.slice(0, L.website.max) || undefined,
        },
      },
      {
        onSuccess: () => reset(),
        // A DTO 400 lands under its field (Rule 6b); only what no field takes
        // — the honeypot, a 429, an outage — stays in the banner.
        onError: (error) => {
          const { mapped, unmapped } = applyServerFieldErrors(
            error,
            setError,
            CONTACT_FIELD_MAP,
            contactServerFieldMessages(error),
          );
          setOnField(mapped.length > 0 && unmapped.length === 0);
        },
      },
    );
  };

  if (submit.isSuccess) {
    return (
      <div className="rounded-card border border-border bg-card p-8 shadow-card">
        <div className="flex flex-col items-center py-10 text-center">
          <span className="mb-[18px] inline-flex size-16 items-center justify-center rounded-full bg-success/16 text-success">
            <Check className="size-8" strokeWidth={2.4} aria-hidden="true" />
          </span>
          <b className="mb-2 font-display text-xl font-bold text-foreground">
            {d.sentHeading}
          </b>
          <p className="mb-5 max-w-[340px] text-sm leading-relaxed text-muted-foreground">
            {d.sentBody}
          </p>
          <button
            type="button"
            onClick={() => submit.reset()}
            className="h-11 rounded-xl border border-border bg-background px-6 text-sm font-semibold text-foreground transition-colors hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {d.sentAgain}
          </button>
        </div>
      </div>
    );
  }

  // The per-email cooldown and the per-IP throttle both answer 429 but clear
  // after 10 minutes vs one (TASK-452); anything else → generic submit error.
  // TASK-762: the cooldown sentence names the REAL remaining minutes when the
  // API sends them, and falls back to the fixed text when it does not.
  const cooldownMinutes = contactRetryAfterMinutes(submit.error);
  const errorMessage =
    submit.isError && !onField
      ? {
          cooldown:
            cooldownMinutes !== undefined
              ? d.errors.cooldownIn(cooldownMinutes)
              : d.errors.cooldown,
          rateLimited: d.errors.rateLimited,
          failed: d.errors.submitFailed,
        }[contactSubmitErrorKind(submit.error)]
      : null;

  return (
    <div className="rounded-card border border-border bg-card p-8 shadow-card">
      <h2 className="mb-1.5 font-display text-2xl font-bold text-foreground">
        {d.formHeading}
      </h2>
      <p className="mb-[22px] text-sm leading-relaxed text-muted-foreground">
        {d.formIntro}
      </p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        <fieldset
          className="flex flex-col gap-2.5"
          aria-describedby={errors.topic ? "contact-topic-error" : undefined}
        >
          <legend className={`mb-1 ${LABEL}`}>{d.topicLabel}</legend>
          <div className="flex flex-wrap gap-2">
            {d.topics.map((t) => {
              const active = t.key === topic;
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setValue("topic", t.key, {
                      shouldDirty: true,
                      shouldValidate: Boolean(errors.topic),
                    })
                  }
                  className={`h-[38px] rounded-md border px-3.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    // Tint, not filled (TASK-865): a selected option, not an
                    // action — the submit below is the page's one primary.
                    // text-foreground, because text-primary on the tint
                    // falls under 4.5:1 in the dark theme.
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background text-foreground hover:border-primary"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          {/* Only a server refusal can reach it — the topics are fixed keys —
              but a blocking rule without a rendered error is a silent button. */}
          {errors.topic && (
            <p id="contact-topic-error" role="alert" className={ERROR}>
              {errors.topic.message}
            </p>
          )}
        </fieldset>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div className="flex flex-col gap-[7px]">
            <label htmlFor="contact-name" className={LABEL}>
              {d.fieldName}
            </label>
            <input
              id="contact-name"
              autoComplete="name"
              maxLength={L.name.max}
              placeholder={d.fieldNamePlaceholder}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "contact-name-error" : undefined}
              className={FIELD}
              {...register("name")}
            />
            {errors.name && (
              <p id="contact-name-error" role="alert" className={ERROR}>
                {errors.name.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-[7px]">
            <label htmlFor="contact-phone" className={LABEL}>
              {d.fieldPhone}
            </label>
            {/* Controlled, not `register`d: the field displays the mask while
                the form value stays the sanitised raw string. */}
            <Controller
              name="phone"
              control={control}
              render={({ field }) => (
                <PhoneInput
                  id="contact-phone"
                  autoComplete="tel"
                  maxLength={L.phone.max}
                  placeholder={d.fieldPhonePlaceholder}
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={
                    errors.phone ? "contact-phone-error" : undefined
                  }
                  className={PHONE_FIELD}
                  {...field}
                />
              )}
            />
            {errors.phone && (
              <p id="contact-phone-error" role="alert" className={ERROR}>
                {errors.phone.message}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-[7px]">
          <label htmlFor="contact-email" className={LABEL}>
            {d.fieldEmail}
          </label>
          <input
            id="contact-email"
            type="email"
            autoComplete="email"
            maxLength={EMAIL_MAX_LENGTH}
            placeholder={d.fieldEmailPlaceholder}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "contact-email-error" : undefined}
            className={FIELD}
            {...register("email")}
          />
          {errors.email && (
            <p id="contact-email-error" role="alert" className={ERROR}>
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-[7px]">
          <label htmlFor="contact-order-ref" className={LABEL}>
            {d.fieldOrder}{" "}
            <span className="font-normal text-muted-foreground">
              {d.fieldOrderOptional}
            </span>
          </label>
          <input
            id="contact-order-ref"
            maxLength={L.orderRef.max}
            placeholder={d.fieldOrderPlaceholder}
            aria-invalid={Boolean(errors.orderRef)}
            aria-describedby={
              errors.orderRef ? "contact-order-ref-error" : undefined
            }
            className={`${FIELD} font-mono`}
            {...register("orderRef")}
          />
          {errors.orderRef && (
            <p id="contact-order-ref-error" role="alert" className={ERROR}>
              {errors.orderRef.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-[7px]">
          <label htmlFor="contact-message" className={LABEL}>
            {d.fieldMessage}
          </label>
          <textarea
            id="contact-message"
            rows={5}
            maxLength={L.message.max}
            placeholder={d.fieldMessagePlaceholder}
            aria-invalid={Boolean(errors.message)}
            aria-describedby={
              errors.message ? "contact-message-error" : undefined
            }
            className="resize-y rounded-xl border-[1.5px] border-border bg-background px-[15px] py-3 text-base text-foreground outline-none focus-visible:border-primary md:text-sm"
            {...register("message")}
          />
          {errors.message && (
            <p id="contact-message-error" role="alert" className={ERROR}>
              {errors.message.message}
            </p>
          )}
        </div>

        <ContactHoneypot {...register(CONTACT_HONEYPOT_FIELD)} />

        <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
          <input
            id="contact-consent"
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--color-primary)]"
            aria-invalid={Boolean(errors.consent)}
            aria-describedby={
              errors.consent ? "contact-consent-error" : undefined
            }
            {...register("consent")}
          />
          <span>
            {d.consentBefore}
            {/* TASK-866 — the privacy policy itself, not the /legal hub:
                the shopper consents to one document, so they open that one. */}
            <Link href={d.consentHref} className="text-primary hover:underline">
              {d.consentLink}
            </Link>
          </span>
        </label>
        {errors.consent && (
          <p id="contact-consent-error" role="alert" className={ERROR}>
            {errors.consent.message}
          </p>
        )}

        {errorMessage && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {errorMessage}
          </p>
        )}

        {/* The page's one primary action (TASK-865, design-system §1). */}
        <Button
          type="submit"
          size="lg"
          disabled={submit.isPending}
          className="h-12 rounded-cta text-base font-bold"
        >
          {submit.isPending ? d.submitting : d.submit}
        </Button>
      </form>
    </div>
  );
}
