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
    <section className="mt-11 flex flex-wrap items-center justify-between gap-7 rounded-[18px] border border-border bg-card p-6 shadow-card sm:p-9 md:p-11">
      <div className="max-w-[480px] min-w-0">
        <h2 className="mb-2 font-display text-[23px] font-bold tracking-tight text-foreground">
          {d.heading}
        </h2>
        <p className="text-[14.5px] leading-relaxed text-muted-foreground">
          {d.subtitle}
        </p>
      </div>
      {/* The floor starts at `sm`. TASK-410 made the form itself wrap at 320px,
          but a hard `min-w-[300px]` is a floor no flex algorithm can go under:
          at 320px the section's content box is ~214px, so the form stuck ~33px
          past the right edge and `/promo` was the one storefront route still
          scrolling sideways after the wave declared that fixed. */}
      <NewsletterSubscribeForm
        source="promo"
        className="max-w-[460px] flex-1 sm:min-w-[300px]"
        inputClassName="h-[52px] rounded-[13px] border-[1.5px] px-[18px] text-[15px]"
        buttonClassName="h-[52px] rounded-[13px] px-6 text-[15px]"
      />
    </section>
  );
}
