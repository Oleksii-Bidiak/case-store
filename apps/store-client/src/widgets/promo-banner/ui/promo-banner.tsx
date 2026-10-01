import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BannerBackdrop, Button } from "@/shared/ui";
import { dict, PAGE_CONTAINER, H2_CLASS } from "@/shared/config";
import type { BannerEntity } from "@/shared/api/generated/models";

interface PromoBannerProps {
  /** PROMO_BANNER banner (falls back to the hardcoded wide promo when absent). */
  banner?: BannerEntity;
}

/**
 * PromoBanner — the wide, full-width promotional banner near the bottom of the
 * homepage. Server Component. Driven by the admin PROMO_BANNER banner when one
 * is published; otherwise the hardcoded wide-promo copy renders unchanged. The
 * CTA button only renders when there is a label + href to point at.
 */
export function PromoBanner({ banner }: PromoBannerProps = {}) {
  const fallback = dict.home.widePromo;

  const eyebrow = banner ? undefined : fallback.eyebrow;
  const title = banner?.title ?? fallback.title;
  const subtitle = banner ? (banner.subtitle ?? undefined) : fallback.subtitle;
  const ctaLabel = banner ? (banner.ctaLabel ?? undefined) : fallback.cta;
  const ctaHref = banner ? (banner.ctaHref ?? undefined) : fallback.href;
  const imageUrl = banner?.imageUrl ?? undefined;

  return (
    <section className={PAGE_CONTAINER}>
      <div className="relative isolate flex flex-wrap items-center justify-between gap-8 overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 to-primary p-10 sm:p-12">
        {/* Admin picture under the copy (TASK-740); the gradient without one. */}
        <BannerBackdrop
          src={imageUrl}
          sizes="(max-width: 1280px) 100vw, 1280px"
          scrimClassName="bg-slate-900/60"
        />
        <div className="max-w-2xl text-white">
          {eyebrow && (
            <span className="inline-block rounded-full bg-primary px-3 py-1 text-xs font-bold tracking-wide text-primary-foreground uppercase">
              {eyebrow}
            </span>
          )}
          <h2 className={`mt-4 ${H2_CLASS} text-balance`}>{title}</h2>
          {subtitle && (
            <p className="mt-2.5 text-base text-white/80">{subtitle}</p>
          )}
        </div>
        {ctaLabel && ctaHref && (
          // Outline on the dark gradient (TASK-865): the hero slide CTA is the
          // homepage's one primary action (design-system §1).
          <Button
            size="lg"
            variant="outline"
            asChild
            className="h-11 rounded-cta border-white/40 bg-white/10 font-semibold text-white shadow-none hover:bg-white/20 hover:text-white dark:border-white/40 dark:bg-white/10 dark:hover:bg-white/20"
          >
            <Link href={ctaHref}>
              {ctaLabel}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}
