"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useContactControllerSubmit } from "@/entities/contact";
import { dict } from "@/shared/config";
// The mask function rather than `shared/ui`'s `PhoneInput`: this form draws its
// own fields (`FIELD` below), and pulling in the shadcn-styled input would drag
// a second set of base classes into a panel that does not use them. What must be
// shared is the rule and the mask — both live in `shared/lib/phone` (TASK-407).
import { formatUAPhone } from "@/shared/lib/phone";
import { contactSchema, type ContactFormValues } from "../model/contact-schema";

const FIELD =
  "h-[46px] rounded-xl border-[1.5px] border-border bg-background px-[15px] text-[14.5px] text-foreground outline-none focus-visible:border-primary";
const LABEL = "text-[13px] font-semibold text-foreground";
const ERROR = "text-[12.5px] font-medium text-destructive";

/**
 * ContactForm — the "Напишіть нам" message form. Submits to `POST /api/contact`
 * via the generated Orval mutation hook (react-hook-form + zod validation that
 * mirrors the backend DTO). On success it swaps to a confirmation panel; a
 * failed request (network / 429 rate-limit / validation) surfaces a friendly UA
 * error without losing the entered values.
 */
export function ContactForm() {
  const d = dict.contact;
  const submit = useContactControllerSubmit();

  const {
    register,
    handleSubmit,
    control,
    setValue,
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
    },
  });

  // `useWatch` (not `watch()`) keeps the component memoizable under the React
  // Compiler while still re-rendering the topic row as the selection changes.
  const topic = useWatch({ control, name: "topic" });

  const onSubmit = (values: ContactFormValues) => {
    submit.mutate(
      {
        data: {
          name: values.name,
          phone: values.phone,
          email: values.email,
          message: values.message,
          topic: values.topic || undefined,
          orderRef: values.orderRef?.trim() ? values.orderRef : undefined,
        },
      },
      {
        onSuccess: () => reset(),
      },
    );
  };

  if (submit.isSuccess) {
    return (
      <div className="rounded-[18px] border border-border bg-card p-8 shadow-card">
        <div className="flex flex-col items-center py-10 text-center">
          <span className="mb-[18px] inline-flex size-16 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-success)_16%,var(--color-card))] text-success">
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

  // 429 → dedicated rate-limit copy; any other failure → generic submit error.
  const errorMessage = submit.isError
    ? submit.error?.response?.status === 429
      ? d.errors.rateLimited
      : d.errors.submitFailed
    : null;

  return (
    <div className="rounded-[18px] border border-border bg-card p-8 shadow-card">
      <h2 className="mb-1.5 font-display text-[23px] font-bold text-foreground">
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
        <fieldset className="flex flex-col gap-2.5">
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
                    setValue("topic", t.key, { shouldDirty: true })
                  }
                  className={`h-[38px] rounded-md border px-4 text-[13.5px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:border-primary"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <label className="flex flex-col gap-[7px]">
            <span className={LABEL}>{d.fieldName}</span>
            <input
              id="contact-name"
              placeholder={d.fieldNamePlaceholder}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "contact-name-error" : undefined}
              className={FIELD}
              {...register("name")}
            />
            {errors.name && (
              <span id="contact-name-error" role="alert" className={ERROR}>
                {errors.name.message}
              </span>
            )}
          </label>
          <label className="flex flex-col gap-[7px]">
            <span className={LABEL}>{d.fieldPhone}</span>
            {/* Controlled, not `register`d: the field displays the mask while
                the form value stays the raw string the shopper typed. */}
            <Controller
              name="phone"
              control={control}
              render={({ field }) => (
                <input
                  id="contact-phone"
                  type="tel"
                  inputMode="numeric"
                  placeholder={d.fieldPhonePlaceholder}
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={
                    errors.phone ? "contact-phone-error" : undefined
                  }
                  className={FIELD}
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={formatUAPhone(field.value ?? "")}
                  onChange={(event) => field.onChange(event.target.value)}
                />
              )}
            />
            {errors.phone && (
              <span id="contact-phone-error" role="alert" className={ERROR}>
                {errors.phone.message}
              </span>
            )}
          </label>
        </div>

        <label className="flex flex-col gap-[7px]">
          <span className={LABEL}>{d.fieldEmail}</span>
          <input
            id="contact-email"
            type="email"
            placeholder={d.fieldEmailPlaceholder}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "contact-email-error" : undefined}
            className={FIELD}
            {...register("email")}
          />
          {errors.email && (
            <span id="contact-email-error" role="alert" className={ERROR}>
              {errors.email.message}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-[7px]">
          <span className={LABEL}>
            {d.fieldOrder}{" "}
            <span className="font-normal text-muted-foreground">
              {d.fieldOrderOptional}
            </span>
          </span>
          <input
            placeholder={d.fieldOrderPlaceholder}
            className={`${FIELD} font-mono`}
            {...register("orderRef")}
          />
        </label>

        <label className="flex flex-col gap-[7px]">
          <span className={LABEL}>{d.fieldMessage}</span>
          <textarea
            id="contact-message"
            rows={5}
            placeholder={d.fieldMessagePlaceholder}
            aria-invalid={Boolean(errors.message)}
            aria-describedby={
              errors.message ? "contact-message-error" : undefined
            }
            className="resize-y rounded-xl border-[1.5px] border-border bg-background px-[15px] py-3 text-[14.5px] text-foreground outline-none focus-visible:border-primary"
            {...register("message")}
          />
          {errors.message && (
            <span id="contact-message-error" role="alert" className={ERROR}>
              {errors.message.message}
            </span>
          )}
        </label>

        <label className="flex cursor-pointer items-start gap-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
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
            <Link href="/legal" className="text-primary hover:underline">
              {d.consentLink}
            </Link>
          </span>
        </label>
        {errors.consent && (
          <span id="contact-consent-error" role="alert" className={ERROR}>
            {errors.consent.message}
          </span>
        )}

        {errorMessage && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={submit.isPending}
          className="h-[50px] rounded-xl bg-primary text-[15px] font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submit.isPending ? d.submitting : d.submit}
        </button>
      </form>
    </div>
  );
}
