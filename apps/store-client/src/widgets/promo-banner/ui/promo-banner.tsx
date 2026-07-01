import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * PromoBanner — the wide, full-width promotional banner near the bottom of the
 * homepage. Static Server Component; copy from the dictionary, CTA links to a
 * real storefront route.
 */
export function PromoBanner() {
  const promo = dict.home.widePromo;

  return (
    <section className="mx-auto w-full max-w-7xl px-4">
      <div className="flex flex-wrap items-center justify-between gap-8 rounded-2xl bg-gradient-to-r from-slate-900 to-primary p-10 sm:p-12">
        <div className="max-w-2xl text-white">
          <span className="inline-block rounded-full bg-primary px-3 py-1 text-xs font-bold tracking-wide text-primary-foreground uppercase">
            {promo.eyebrow}
          </span>
          <h2 className="mt-4 font-display text-2xl leading-tight font-bold tracking-tight text-balance sm:text-3xl">
            {promo.title}
          </h2>
          <p className="mt-2.5 text-base text-white/80">{promo.subtitle}</p>
        </div>
        <Button
          size="lg"
          asChild
          className="shadow-[var(--shadow-lift)] hover:bg-primary/90"
        >
          <Link href={promo.href}>
            {promo.cta}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
