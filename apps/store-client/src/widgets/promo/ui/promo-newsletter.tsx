"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { dict } from "@/shared/config";

/**
 * PromoNewsletter — the "Першими дізнавайтесь про знижки" subscribe block. STUB:
 * there is no newsletter backend yet (TASK-166 / TASK-173), so submit only flips
 * a local confirmation + toast — no network call.
 */
export function PromoNewsletter() {
  const [sent, setSent] = useState(false);
  const d = dict.promo.newsletter;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSent(true);
    toast.success(d.success);
  }

  return (
    <section className="mt-11 flex flex-wrap items-center justify-between gap-7 rounded-[18px] border border-border bg-card p-9 shadow-[var(--shadow-card)] sm:p-11">
      <div className="max-w-[480px]">
        <h2 className="mb-2 font-display text-[23px] font-bold tracking-tight text-foreground">
          {d.heading}
        </h2>
        <p className="text-[14.5px] leading-relaxed text-muted-foreground">
          {d.subtitle}
        </p>
      </div>
      <form
        onSubmit={onSubmit}
        className="flex min-w-[300px] max-w-[460px] flex-1 flex-col gap-2"
      >
        <div className="flex gap-2.5">
          <input
            required
            type="email"
            aria-label={d.emailAria}
            placeholder={d.placeholder}
            className="h-[52px] flex-1 rounded-[13px] border-[1.5px] border-border bg-background px-[18px] text-[15px] text-foreground outline-none focus-visible:border-primary"
          />
          <button
            type="submit"
            className="h-[52px] cursor-pointer rounded-[13px] bg-primary px-6 text-[15px] font-bold whitespace-nowrap text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {sent ? d.submitted : d.submit}
          </button>
        </div>
        <p className="text-[12px] text-muted-foreground">{d.stubNote}</p>
      </form>
    </section>
  );
}
