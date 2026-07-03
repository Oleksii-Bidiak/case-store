"use client";

import { useState, type FormEvent } from "react";
import { dict } from "@/shared/config";

const FIELD =
  "h-[46px] rounded-xl border-[1.5px] border-border bg-background px-[15px] text-[14.5px] text-foreground outline-none focus-visible:border-primary";

/**
 * InfoContactForm — the "Напишіть нам" form. STUB: there is no contact-message
 * backend, so submit only shows a local confirmation (no network call). Tracked
 * with the info/support follow-up (TASK-177).
 */
export function InfoContactForm() {
  const [sent, setSent] = useState(false);
  const d = dict.info;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSent(true);
  }

  return (
    <div className="rounded-[18px] border border-border bg-card p-[30px] shadow-[var(--shadow-card)]">
      <h2 className="mb-1.5 font-display text-[22px] font-bold text-foreground">
        {d.formHeading}
      </h2>
      <p className="mb-5 text-[13.5px] text-muted-foreground">{d.formIntro}</p>

      {sent ? (
        <p
          role="status"
          className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-foreground"
        >
          {d.formSent}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input
            required
            aria-label={d.formName}
            placeholder={d.formName}
            className={FIELD}
          />
          <input
            required
            type="email"
            aria-label={d.formEmail}
            placeholder={d.formEmail}
            className={FIELD}
          />
          <textarea
            required
            rows={4}
            aria-label={d.formMessage}
            placeholder={d.formMessage}
            className="resize-y rounded-xl border-[1.5px] border-border bg-background px-[15px] py-3 text-[14.5px] text-foreground outline-none focus-visible:border-primary"
          />
          <button
            type="submit"
            className="h-12 cursor-pointer rounded-xl bg-primary text-[15px] font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {d.formSubmit}
          </button>
          <p className="text-[12px] text-muted-foreground">{d.formStubNote}</p>
        </form>
      )}
    </div>
  );
}
