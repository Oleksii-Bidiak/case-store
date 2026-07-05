import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";
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

  return (
    <section className="mx-auto w-full max-w-7xl px-4">
      <div className="flex flex-wrap items-center justify-between gap-8 rounded-2xl bg-gradient-to-r from-slate-900 to-primary p-10 sm:p-12">
        <div className="max-w-2xl text-white">
          {eyebrow && (
            <span className="inline-block rounded-full bg-primary px-3 py-1 text-xs font-bold tracking-wide text-primary-foreground uppercase">
              {eyebrow}
            </span>
          )}
          <h2 className="mt-4 font-display text-2xl leading-tight font-bold tracking-tight text-balance sm:text-3xl">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-2.5 text-base text-white/80">{subtitle}</p>
          )}
        </div>
        {ctaLabel && ctaHref && (
          <Button
            size="lg"
            asChild
            className="shadow-[var(--shadow-lift)] hover:bg-primary/90"
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
