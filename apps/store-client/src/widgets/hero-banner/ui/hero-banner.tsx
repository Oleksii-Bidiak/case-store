import Link from "next/link";
import { ArrowRight, Smartphone, Zap, Headphones, Star } from "lucide-react";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

// Floating "showcase" tiles on the right of the hero. We have no product
// imagery yet, so these glass cards with icons stand in for it and give the
// hero a retail focal point without looking empty.
const SHOWCASE = [
  { icon: Smartphone, label: dict.hero.highlights.cases },
  { icon: Zap, label: dict.hero.highlights.charging },
  { icon: Headphones, label: dict.hero.highlights.audio },
] as const;

/**
 * HeroBanner — static, server-rendered hero for the homepage. A layered
 * indigo gradient with soft glows on the left holds the headline and CTAs;
 * a glass "showcase" of accessory tiles sits on the right (desktop only).
 * No data fetching or interactivity, so it stays a Server Component.
 */
export function HeroBanner() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-primary to-violet-800 text-primary-foreground"
    >
      {/* Decorative glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 -right-20 size-[28rem] rounded-full bg-white/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -left-24 size-[26rem] rounded-full bg-violet-400/20 blur-3xl"
      />
      {/* Subtle dotted texture */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:20px_20px]"
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:py-24 lg:grid-cols-[1.1fr_1fr] lg:py-28">
        {/* Left — copy + CTAs */}
        <div className="flex flex-col items-start gap-5">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tracking-wide uppercase backdrop-blur-sm ring-1 ring-white/20">
            <span className="size-1.5 rounded-full bg-amber-300" />
            {dict.hero.badge}
          </span>
          <h1
            id="hero-heading"
            className="max-w-2xl font-display text-4xl font-extrabold tracking-tight text-balance sm:text-5xl md:text-6xl"
          >
            {dict.hero.heading}
          </h1>
          <p className="max-w-xl text-lg text-primary-foreground/85">
            {dict.hero.subtitle}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              asChild
              className="bg-background text-foreground shadow-[var(--shadow-elevated)] hover:bg-muted"
            >
              <Link href="/products">
                {dict.hero.cta}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="border-white/40 bg-transparent text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
            >
              <Link href="/products?sortBy=createdAt&sortOrder=desc">
                {dict.hero.ctaSecondary}
              </Link>
            </Button>
          </div>

          {/* Social-proof rating chip */}
          <div className="mt-2 inline-flex items-center gap-2 text-sm text-primary-foreground/90">
            <span className="flex" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star
                  key={i}
                  className="size-4 text-amber-300"
                  fill="currentColor"
                  stroke="none"
                />
              ))}
            </span>
            <span className="font-medium">{dict.hero.ratingBadge}</span>
          </div>
        </div>

        {/* Right — glass showcase (decorative, desktop only) */}
        <div aria-hidden="true" className="relative hidden h-80 lg:block">
          {SHOWCASE.map(({ icon: Icon, label }, i) => (
            <div
              key={label}
              className={[
                "absolute flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-md shadow-[var(--shadow-lift)]",
                i === 0 && "left-2 top-4 rotate-[-4deg]",
                i === 1 && "right-4 top-24 rotate-[3deg]",
                i === 2 && "bottom-6 left-10 rotate-[-2deg]",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className="inline-flex size-11 items-center justify-center rounded-xl bg-white/20">
                <Icon className="size-6" />
              </span>
              <span className="pr-2 text-sm font-semibold">{label}</span>
            </div>
          ))}

          {/* Accent discount orb */}
          <div className="absolute right-2 bottom-2 flex size-24 flex-col items-center justify-center rounded-full bg-sale text-sale-foreground shadow-[var(--shadow-lift)]">
            <span className="font-display text-2xl font-extrabold leading-none">
              −40%
            </span>
            <span className="mt-0.5 text-[10px] font-semibold tracking-wide uppercase opacity-90">
              SALE
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
