import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { dict, H1_CLASS, H2_CLASS } from "@/shared/config";
import { PromoCountdown } from "./promo-countdown";
import { PromoCoupons } from "./promo-coupons";
import { PromoNewsletter } from "./promo-newsletter";

/**
 * Id of the «Товари зі знижкою» section: the hero CTA jumps to it, and the
 * listing in the `deals` slot points every URL it writes back at it
 * (`ProductListView` `anchorId`, TASK-1301) so a filter click stays on the deals.
 */
export const PROMO_DEALS_ANCHOR = "deals";

interface PromoViewProps {
  /**
   * The «Товари зі знижкою» listing (TASK-1301). Since the section became the
   * catalogue itself — rail, drawer, chips, sort, view toggle, pagination —
   * the route composes `ProductListView` with its discount lock and hands it in
   * here: one widget never imports another, and the listing keeps the ONE
   * params builder the server prefetches with.
   */
  deals?: ReactNode;
}

/**
 * PromoView — the Акції (promo) page from the Promo.dc.html import: a gradient
 * hero with a live countdown, the weekly coupon tickets, the on-sale catalogue
 * (the `deals` slot, under its own heading and the hero CTA's `#deals` anchor)
 * and a subscribe block. Server component shell; the interactive parts
 * (countdown, copy, subscribe) are client sub-widgets.
 */
export function PromoView({ deals }: PromoViewProps) {
  const d = dict.promo;

  return (
    <div>
      <nav
        aria-label={d.breadcrumb}
        className="mb-[18px] flex items-center gap-2.5 text-sm text-muted-foreground"
      >
        <Link href="/" className="hover:text-foreground">
          {d.breadcrumbHome}
        </Link>
        <span aria-hidden="true" className="opacity-50">
          ›
        </span>
        <span className="font-medium text-foreground">{d.breadcrumb}</span>
      </nav>

      {/* Hero. */}
      <div
        className="relative overflow-hidden rounded-2xl px-8 py-12 text-white shadow-elevated sm:px-14"
        style={{
          background:
            "linear-gradient(120deg, oklch(0.42 0.15 350) 0%, var(--color-sale) 55%, oklch(0.58 0.16 45) 100%)",
        }}
      >
        <div className="relative z-[2] max-w-[560px]">
          <span className="inline-block rounded-full bg-white/[0.18] px-3.5 py-1.5 text-xs font-bold tracking-[0.08em] uppercase">
            {d.hero.badge}
          </span>
          <h1 className={`mt-4 mb-3 ${H1_CLASS}`}>{d.hero.heading}</h1>
          <p className="mb-7 max-w-[440px] text-[17px] leading-normal opacity-95">
            {d.hero.subtitle}
          </p>
          <div className="flex flex-wrap items-center gap-3.5">
            <a
              href={`#${PROMO_DEALS_ANCHOR}`}
              className="inline-flex h-[52px] items-center gap-2.5 rounded-cta bg-white px-6 text-base font-bold text-sale transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {d.hero.cta}
              <ArrowRight className="size-[18px]" aria-hidden="true" />
            </a>
            <PromoCountdown />
          </div>
        </div>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-10 -right-10 z-[1] font-display text-[280px] leading-none font-bold opacity-[0.12]"
        >
          %
        </span>
      </div>

      <PromoCoupons />
      <section
        id={PROMO_DEALS_ANCHOR}
        aria-labelledby="promo-deals-heading"
        className="mt-10 scroll-mt-24"
      >
        <h2
          id="promo-deals-heading"
          className={`mb-4 ${H2_CLASS} text-foreground`}
        >
          {d.dealsHeading}
        </h2>
        {deals}
      </section>
      <PromoNewsletter />
    </div>
  );
}
