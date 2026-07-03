import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { dict } from "@/shared/config";
import { PromoCountdown } from "./promo-countdown";
import { PromoCoupons } from "./promo-coupons";
import { PromoDeals } from "./promo-deals";
import { PromoNewsletter } from "./promo-newsletter";

/**
 * PromoView — the Акції (promo) page from the Promo.dc.html import: a gradient
 * hero with a live countdown, the weekly coupon tickets, a real on-sale product
 * grid (category-filtered), and a subscribe block. Server component shell; the
 * interactive parts (countdown, copy, deals, subscribe) are client sub-widgets.
 */
export function PromoView() {
  const d = dict.promo;

  return (
    <div>
      <nav
        aria-label={d.breadcrumb}
        className="mb-[18px] flex items-center gap-2.5 text-[13.5px] text-muted-foreground"
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
        className="relative overflow-hidden rounded-[22px] px-8 py-12 text-white shadow-[var(--shadow-elevated)] sm:px-14"
        style={{
          background:
            "linear-gradient(120deg, oklch(0.42 0.15 350) 0%, var(--color-sale) 55%, oklch(0.58 0.16 45) 100%)",
        }}
      >
        <div className="relative z-[2] max-w-[560px]">
          <span className="inline-block rounded-full bg-white/[0.18] px-3.5 py-1.5 text-[12.5px] font-bold tracking-[0.08em] uppercase">
            {d.hero.badge}
          </span>
          <h1 className="mt-4 mb-3 font-display text-[34px] leading-[1.05] font-bold tracking-tight sm:text-[46px]">
            {d.hero.heading}
          </h1>
          <p className="mb-7 max-w-[440px] text-[17px] leading-normal opacity-95">
            {d.hero.subtitle}
          </p>
          <div className="flex flex-wrap items-center gap-3.5">
            <a
              href="#deals"
              className="inline-flex h-[52px] items-center gap-2.5 rounded-[13px] bg-white px-6 text-base font-bold text-sale transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
      <PromoDeals />
      <PromoNewsletter />
    </div>
  );
}
