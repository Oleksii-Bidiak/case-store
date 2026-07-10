"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useContactControllerSubmit } from "@/entities/contact";
import { dict } from "@/shared/config";
import {
  infoContactSchema,
  type InfoContactFormValues,
} from "../model/info-contact-schema";

const FIELD =
  "h-[46px] rounded-xl border-[1.5px] border-border bg-background px-[15px] text-[14.5px] text-foreground outline-none focus-visible:border-primary";
const ERROR = "text-[12.5px] font-medium text-destructive";

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
    formState: { errors },
  } = useForm<InfoContactFormValues>({
    resolver: zodResolver(infoContactSchema),
    defaultValues: { name: "", phone: "", email: "", message: "" },
  });

  const onSubmit = (values: InfoContactFormValues) => {
    submit.mutate({ data: values });
  };

  return (
    <div className="rounded-[18px] border border-border bg-card p-[30px] shadow-[var(--shadow-card)]">
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
              aria-label={d.formName}
              placeholder={d.formName}
              aria-invalid={Boolean(errors.name)}
              className={FIELD}
              {...register("name")}
            />
            {errors.name && (
              <span role="alert" className={ERROR}>
                {errors.name.message}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <input
              type="tel"
              aria-label={d.formPhone}
              placeholder={d.formPhone}
              aria-invalid={Boolean(errors.phone)}
              className={FIELD}
              {...register("phone")}
            />
            {errors.phone && (
              <span role="alert" className={ERROR}>
                {errors.phone.message}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <input
              type="email"
              aria-label={d.formEmail}
              placeholder={d.formEmail}
              aria-invalid={Boolean(errors.email)}
              className={FIELD}
              {...register("email")}
            />
            {errors.email && (
              <span role="alert" className={ERROR}>
                {errors.email.message}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <textarea
              rows={4}
              aria-label={d.formMessage}
              placeholder={d.formMessage}
              aria-invalid={Boolean(errors.message)}
              className="resize-y rounded-xl border-[1.5px] border-border bg-background px-[15px] py-3 text-[14.5px] text-foreground outline-none focus-visible:border-primary"
              {...register("message")}
            />
            {errors.message && (
              <span role="alert" className={ERROR}>
                {errors.message.message}
              </span>
            )}
          </div>

          {submit.isError && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {d.formError}
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
