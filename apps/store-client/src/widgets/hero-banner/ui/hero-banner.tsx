import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * HeroBanner — static, server-rendered hero section for the homepage.
 * Gradient background with a promo badge, headline, and dual CTAs.
 * No data fetching or interactivity, so it stays a Server Component.
 */
export function HeroBanner() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-indigo-700 text-primary-foreground"
    >
      {/* Decorative glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-white/10 blur-3xl"
      />
      <div className="relative mx-auto flex max-w-7xl flex-col items-start gap-5 px-4 py-20 sm:py-28">
        <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tracking-wide uppercase backdrop-blur-sm">
          {dict.hero.badge}
        </span>
        <h1
          id="hero-heading"
          className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl"
        >
          {dict.hero.heading}
        </h1>
        <p className="max-w-xl text-lg text-primary-foreground/90">
          {dict.hero.subtitle}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            asChild
            className="bg-background text-foreground hover:bg-muted"
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
      </div>
    </section>
  );
}
