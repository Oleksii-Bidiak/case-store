"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { PhoneInput } from "@/shared/ui";
import {
  infoContactSchema,
  type InfoContactFormValues,
} from "../model/info-contact-schema";

const FIELD =
  "h-[46px] rounded-xl border-[1.5px] border-border bg-background px-[15px] text-base text-foreground outline-none focus-visible:border-primary md:text-sm";
// TASK-1984 (forms Rule 5b): the shared `PhoneInput`, its `Input` base look
// merged away (`cn` is tailwind-merge) — as in `widgets/contact`.
const PHONE_FIELD = `${FIELD} shadow-none hover:border-border focus-visible:ring-0 dark:bg-background`;
const ERROR = "text-xs font-medium text-destructive";
const L = CONTACT_LIMITS;

/** TASK-762: the real remaining minutes when the API sends them. */
function cooldownText(error: unknown): string {
  const minutes = contactRetryAfterMinutes(error);
  return minutes !== undefined
    ? dict.contact.errors.cooldownIn(minutes)
    : dict.contact.errors.cooldown;
}

/**
 * The banner sentence for a refusal no field takes. The cooldown gets its own
 * (TASK-452), and so does the per-IP 429 (TASK-1984): this form's generic «не
 * вдалося» read as an outage to someone who was merely too quick.
 */
function bannerText(error: unknown): string {
  switch (contactSubmitErrorKind(error)) {
    case "cooldown":
      return cooldownText(error);
    case "rateLimited":
      return dict.contact.errors.rateLimited;
    default:
      return dict.info.formError;
  }
}

/**
 * InfoContactForm — the compact "Напишіть нам" form on the /info page. Submits
 * to `POST /api/contact` via the generated Orval mutation hook (react-hook-form
 * + zod validation mirroring the backend DTO). Shows a confirmation on success
 * and a friendly UA error (network / 429) on failure; a server 400 lands under
 * the field it names (forms Rule 6b).
 */
export function InfoContactForm() {
  const d = dict.info;
  const submit = useContactControllerSubmit();
  // True when the last refusal now lives under its fields (Rule 6c).
  const [onField, setOnField] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<InfoContactFormValues>({
    resolver: zodResolver(infoContactSchema),
    defaultValues: { name: "", phone: "", email: "", message: "", website: "" },
  });

  const onSubmit = ({ website, ...values }: InfoContactFormValues) => {
    setOnField(false);
    // Only a bot fills the honeypot (TASK-452); a person's request carries no
    // key. Clamped to the DTO's 255 — the schema does not validate it.
    submit.mutate(
      {
        data: {
          ...values,
          website: website?.slice(0, L.website.max) || undefined,
        },
      },
      {
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

  return (
    <div className="rounded-card border border-border bg-card p-[30px] shadow-card">
      <h2 className="mb-1.5 font-display text-2xl font-bold text-foreground">
        {d.formHeading}
      </h2>
      <p className="mb-5 text-sm text-muted-foreground">{d.formIntro}</p>

      {submit.isSuccess ? (
        <p
          role="status"
          className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-foreground"
        >
          {d.formSent}
        </p>
      ) : (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-3"
          noValidate
        >
          <div className="flex flex-col gap-1">
            <input
              id="info-contact-name"
              aria-label={d.formName}
              autoComplete="name"
              maxLength={L.name.max}
              placeholder={d.formName}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={
                errors.name ? "info-contact-name-error" : undefined
              }
              className={FIELD}
              {...register("name")}
            />
            {errors.name && (
              <p id="info-contact-name-error" role="alert" className={ERROR}>
                {errors.name.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            {/* TASK-744: controlled with the `/contact` mask — the field shows
                `+380 NN NNN NNNN` while the form value stays what was typed
                (sanitised, TASK-1984). */}
            <Controller
              name="phone"
              control={control}
              render={({ field }) => (
                <PhoneInput
                  id="info-contact-phone"
                  aria-label={d.formPhone}
                  autoComplete="tel"
                  maxLength={L.phone.max}
                  placeholder={d.formPhone}
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={
                    errors.phone ? "info-contact-phone-error" : undefined
                  }
                  className={PHONE_FIELD}
                  {...field}
                />
              )}
            />
            {errors.phone && (
              <p id="info-contact-phone-error" role="alert" className={ERROR}>
                {errors.phone.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <input
              id="info-contact-email"
              type="email"
              aria-label={d.formEmail}
              autoComplete="email"
              maxLength={EMAIL_MAX_LENGTH}
              placeholder={d.formEmail}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={
                errors.email ? "info-contact-email-error" : undefined
              }
              className={FIELD}
              {...register("email")}
            />
            {errors.email && (
              <p id="info-contact-email-error" role="alert" className={ERROR}>
                {errors.email.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <textarea
              id="info-contact-message"
              rows={4}
              aria-label={d.formMessage}
              maxLength={L.message.max}
              placeholder={d.formMessage}
              aria-invalid={Boolean(errors.message)}
              aria-describedby={
                errors.message ? "info-contact-message-error" : undefined
              }
              className="resize-y rounded-xl border-[1.5px] border-border bg-background px-[15px] py-3 text-base text-foreground outline-none focus-visible:border-primary md:text-sm"
              {...register("message")}
            />
            {errors.message && (
              <p id="info-contact-message-error" role="alert" className={ERROR}>
                {errors.message.message}
              </p>
            )}
          </div>

          <ContactHoneypot {...register(CONTACT_HONEYPOT_FIELD)} />

          {submit.isError && !onField && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {bannerText(submit.error)}
            </p>
          )}

          <button
            type="submit"
            disabled={submit.isPending}
            aria-busy={submit.isPending || undefined}
            className="h-12 rounded-xl bg-primary text-[15px] font-bold text-primary-foreground transition-interactive hover:bg-primary-hover hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring active:scale-98 active:bg-primary active:shadow-none disabled:cursor-progress disabled:hover:bg-primary disabled:hover:shadow-none disabled:active:scale-100 motion-reduce:active:scale-100"
          >
            {submit.isPending ? d.formSubmitting : d.formSubmit}
          </button>
        </form>
      )}
    </div>
  );
}
