"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { dict } from "@/shared/config";

const FIELD =
  "h-[46px] rounded-xl border-[1.5px] border-border bg-background px-[15px] text-[14.5px] text-foreground outline-none focus-visible:border-primary";
const LABEL = "text-[13px] font-semibold text-foreground";

/**
 * ContactForm — the "Напишіть нам" message form. STUB: there is no
 * contact-message backend, so submit only flips a local confirmation (no network
 * call). Tracked with the contact/support follow-up (TASK-177).
 */
export function ContactForm() {
  const d = dict.contact;
  const [topic, setTopic] = useState<string>(d.topics[0].key);
  const [sent, setSent] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-[18px] border border-border bg-card p-8 shadow-[var(--shadow-card)]">
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
            onClick={() => setSent(false)}
            className="h-11 cursor-pointer rounded-xl border border-border bg-background px-6 text-sm font-semibold text-foreground transition-colors hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {d.sentAgain}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[18px] border border-border bg-card p-8 shadow-[var(--shadow-card)]">
      <h2 className="mb-1.5 font-display text-[23px] font-bold text-foreground">
        {d.formHeading}
      </h2>
      <p className="mb-[22px] text-sm leading-relaxed text-muted-foreground">
        {d.formIntro}
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
                  onClick={() => setTopic(t.key)}
                  className={`h-[38px] cursor-pointer rounded-[10px] border px-4 text-[13.5px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
              required
              placeholder={d.fieldNamePlaceholder}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-[7px]">
            <span className={LABEL}>{d.fieldPhone}</span>
            <input
              required
              type="tel"
              placeholder={d.fieldPhonePlaceholder}
              className={FIELD}
            />
          </label>
        </div>

        <label className="flex flex-col gap-[7px]">
          <span className={LABEL}>{d.fieldEmail}</span>
          <input
            required
            type="email"
            placeholder={d.fieldEmailPlaceholder}
            className={FIELD}
          />
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
          />
        </label>

        <label className="flex flex-col gap-[7px]">
          <span className={LABEL}>{d.fieldMessage}</span>
          <textarea
            required
            rows={5}
            placeholder={d.fieldMessagePlaceholder}
            className="resize-y rounded-xl border-[1.5px] border-border bg-background px-[15px] py-3 text-[14.5px] text-foreground outline-none focus-visible:border-primary"
          />
        </label>

        <label className="flex cursor-pointer items-start gap-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
          <input
            required
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--color-primary)]"
          />
          <span>
            {d.consentBefore}
            <Link href="/legal" className="text-primary hover:underline">
              {d.consentLink}
            </Link>
          </span>
        </label>

        <button
          type="submit"
          className="h-[50px] cursor-pointer rounded-xl bg-primary text-[15px] font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {d.submit}
        </button>
        <p className="text-[12px] text-muted-foreground">{d.stubNote}</p>
      </form>
    </div>
  );
}
