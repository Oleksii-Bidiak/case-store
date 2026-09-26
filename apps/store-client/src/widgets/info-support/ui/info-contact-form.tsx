"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CONTACT_HONEYPOT_FIELD,
  ContactHoneypot,
  contactRetryAfterMinutes,
  contactSubmitErrorKind,
  useContactControllerSubmit,
} from "@/entities/contact";
import { dict } from "@/shared/config";
// The mask function, as in `widgets/contact/ui/contact-form.tsx` — this panel
// draws its own fields, so `shared/ui`'s `PhoneInput` would bring foreign styles.
import { formatUAPhone } from "@/shared/lib/phone";
import {
  infoContactSchema,
  type InfoContactFormValues,
} from "../model/info-contact-schema";

const FIELD =
  "h-[46px] rounded-xl border-[1.5px] border-border bg-background px-[15px] text-[14.5px] text-foreground outline-none focus-visible:border-primary";
const ERROR = "text-[12.5px] font-medium text-destructive";

/** TASK-762: the real remaining minutes when the API sends them. */
function cooldownText(error: unknown): string {
  const minutes = contactRetryAfterMinutes(error);
  return minutes !== undefined
    ? dict.contact.errors.cooldownIn(minutes)
    : dict.contact.errors.cooldown;
}

/**
 * InfoContactForm — the compact "Напишіть нам" form on the /info page. Submits
 * to `POST /api/contact` via the generated Orval mutation hook (react-hook-form
 * + zod validation mirroring the backend DTO). Shows a confirmation on success
 * and a friendly UA error (network / 429) on failure.
 */
export function InfoContactForm() {
  const d = dict.info;
  const submit = useContactControllerSubmit();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<InfoContactFormValues>({
    resolver: zodResolver(infoContactSchema),
    defaultValues: { name: "", phone: "", email: "", message: "", website: "" },
  });

  const onSubmit = ({ website, ...values }: InfoContactFormValues) => {
    // Only a bot fills the honeypot (TASK-452); a person's request carries no
    // key. Clamped to the DTO's 255 — the schema does not validate it.
    submit.mutate({
      data: { ...values, website: website?.slice(0, 255) || undefined },
    });
  };

  return (
    <div className="rounded-[18px] border border-border bg-card p-[30px] shadow-card">
      <h2 className="mb-1.5 font-display text-[22px] font-bold text-foreground">
        {d.formHeading}
      </h2>
      <p className="mb-5 text-[13.5px] text-muted-foreground">{d.formIntro}</p>

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
              placeholder={d.formName}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={
                errors.name ? "info-contact-name-error" : undefined
              }
              className={FIELD}
              {...register("name")}
            />
            {errors.name && (
              <span id="info-contact-name-error" role="alert" className={ERROR}>
                {errors.name.message}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            {/* TASK-744: controlled with the `/contact` mask — the field shows
                `+380 NN NNN NNNN` while the form value stays what was typed. */}
            <Controller
              name="phone"
              control={control}
              render={({ field }) => (
                <input
                  id="info-contact-phone"
                  type="tel"
                  inputMode="numeric"
                  aria-label={d.formPhone}
                  placeholder={d.formPhone}
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={
                    errors.phone ? "info-contact-phone-error" : undefined
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
              <span
                id="info-contact-phone-error"
                role="alert"
                className={ERROR}
              >
                {errors.phone.message}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <input
              id="info-contact-email"
              type="email"
              aria-label={d.formEmail}
              placeholder={d.formEmail}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={
                errors.email ? "info-contact-email-error" : undefined
              }
              className={FIELD}
              {...register("email")}
            />
            {errors.email && (
              <span
                id="info-contact-email-error"
                role="alert"
                className={ERROR}
              >
                {errors.email.message}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <textarea
              id="info-contact-message"
              rows={4}
              aria-label={d.formMessage}
              placeholder={d.formMessage}
              aria-invalid={Boolean(errors.message)}
              aria-describedby={
                errors.message ? "info-contact-message-error" : undefined
              }
              className="resize-y rounded-xl border-[1.5px] border-border bg-background px-[15px] py-3 text-[14.5px] text-foreground outline-none focus-visible:border-primary"
              {...register("message")}
            />
            {errors.message && (
              <span
                id="info-contact-message-error"
                role="alert"
                className={ERROR}
              >
                {errors.message.message}
              </span>
            )}
          </div>

          <ContactHoneypot {...register(CONTACT_HONEYPOT_FIELD)} />

          {submit.isError && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {/* The cooldown gets its own sentence (TASK-452): this form's
                  generic «спробуйте ще раз за хвилину» is wrong for it. */}
              {contactSubmitErrorKind(submit.error) === "cooldown"
                ? cooldownText(submit.error)
                : d.formError}
            </p>
          )}

          <button
            type="submit"
            disabled={submit.isPending}
            className="h-12 rounded-xl bg-primary text-[15px] font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submit.isPending ? d.formSubmitting : d.formSubmit}
          </button>
        </form>
      )}
    </div>
  );
}
