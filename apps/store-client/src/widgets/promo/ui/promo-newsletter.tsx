import { NewsletterSubscribeForm } from "@/features";
import { dict } from "@/shared/config";

/**
 * PromoNewsletter — the "Першими дізнавайтесь про знижки" subscribe block. Wired
 * to the real newsletter backend (TASK-188) via the reusable
 * NewsletterSubscribeForm feature; `source="promo"` tags the opt-in origin.
 */
export function PromoNewsletter() {
  const d = dict.promo.newsletter;

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
      <NewsletterSubscribeForm
        source="promo"
        className="min-w-[300px] max-w-[460px] flex-1"
        inputClassName="h-[52px] rounded-[13px] border-[1.5px] px-[18px] text-[15px]"
        buttonClassName="h-[52px] rounded-[13px] px-6 text-[15px]"
      />
    </section>
  );
}
