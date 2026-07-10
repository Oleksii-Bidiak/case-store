"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from "lucide-react";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";
import { useReducedMotion } from "@/shared/lib/use-reduced-motion";
import type { BannerEntity } from "@/shared/api/generated/models";

/** Normalised slide shape rendered by the slider (banner- or dictionary-driven). */
type HeroSlide = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  cta?: string;
  href: string;
};

/** The hardcoded fallback slides — rendered when no HERO_SLIDE banners exist. */
const FALLBACK_SLIDES: readonly HeroSlide[] = dict.home.hero.slides;

/** Map admin-managed HERO_SLIDE banners onto the slider's normalised shape. */
function bannersToSlides(banners: BannerEntity[]): HeroSlide[] {
  return banners.map((b) => ({
    title: b.title,
    subtitle: b.subtitle ?? undefined,
    cta: b.ctaLabel ?? undefined,
    href: b.ctaHref ?? "#",
  }));
}

const AUTOPLAY_MS = 7000;

// Per-slide visual theme (copy lives in the dictionary; visuals stay in code).
// Each slide gets its own gradient, text colour, eyebrow pill, CTA button and an
// optional decorative "product" glass panel on the right — mirroring the mockup:
//   0 · brand indigo→violet · white text · frosted panel
//   1 · dark (foreground→primary) · sale eyebrow · no panel
//   2 · success green · white text · frosted panel
// All gradients are token-derived (color-mix/oklch) so they follow the theme.
type SlideTheme = {
  gradient: string;
  text: string;
  eyebrow: string;
  cta: string;
  panel: boolean;
};

const THEMES: SlideTheme[] = [
  {
    gradient:
      "linear-gradient(120deg, color-mix(in oklab, var(--color-primary) 90%, black) 0%, var(--color-primary) 52%, color-mix(in oklab, var(--color-primary) 55%, oklch(0.55 0.2 300)) 100%)",
    text: "text-white",
    eyebrow: "bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-sm",
    cta: "bg-white text-primary hover:bg-white/90",
    panel: true,
  },
  {
    gradient:
      "linear-gradient(120deg, var(--color-foreground) 0%, color-mix(in oklab, var(--color-foreground) 72%, var(--color-primary)) 100%)",
    text: "text-background",
    eyebrow: "bg-sale text-sale-foreground",
    cta: "bg-primary text-primary-foreground hover:bg-primary/90",
    panel: false,
  },
  {
    gradient:
      "linear-gradient(120deg, color-mix(in oklab, var(--color-success) 86%, black) 0%, var(--color-success) 60%, oklch(0.6 0.13 175) 100%)",
    text: "text-white",
    eyebrow: "bg-white/18 text-white ring-1 ring-white/25 backdrop-blur-sm",
    cta: "bg-white text-success hover:bg-white/90",
    panel: true,
  },
];

/**
 * HeroSlider — the homepage hero carousel. Three promotional slides, each with
 * its own token-derived colour theme, prev/next controls, dot indicators and
 * gentle autoplay. Copy comes from the dictionary; CTAs link to real routes.
 *
 * The gradient sits on the outer container (updated per slide) so there is no
 * flash between slides, while the slide content cross-fades. Content is padded
 * clear of the side arrows (px) and the bottom dots (pb); a decorative frosted
 * panel fills the right half on themed slides (hidden below lg so it never
 * crowds the text). Client Component (holds the active-slide state).
 *
 * `banners` (HERO_SLIDE placement) is the data source when the admin has
 * published any; otherwise the hardcoded fallback slides render unchanged.
 */
interface HeroSliderProps {
  banners?: BannerEntity[];
}

export function HeroSlider({ banners }: HeroSliderProps = {}) {
  // Banner-driven when the admin has published HERO_SLIDE banners; otherwise the
  // hardcoded fallback slides keep the homepage looking complete.
  const slides: readonly HeroSlide[] =
    banners && banners.length > 0 ? bannersToSlides(banners) : FALLBACK_SLIDES;

  const [index, setIndex] = useState(0);
  const count = slides.length;

  // Autoplay gates: an explicit pause toggle, pointer/keyboard presence within
  // the slider (hover / focus-within), and the OS reduced-motion preference —
  // any one of them stops the carousel from auto-advancing (design-system §7).
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const reducedMotion = useReducedMotion();

  const go = useCallback(
    (next: number) => {
      setIndex((next + slides.length) % slides.length);
    },
    [slides.length],
  );

  // Clamp at render so a shrinking slide set (e.g. a revalidation swapping
  // banners for the shorter fallback set) never indexes out of range — no
  // setState-in-effect needed. `count` is always ≥ 1 (fallback is non-empty).
  const activeIndex = index % count;

  const autoplayActive = count > 1 && !paused && !hovered && !reducedMotion;

  // Autoplay — resets its timer whenever `activeIndex` changes (incl. manual
  // nav). Never arms while paused, hovered/focused, reduced-motion, or single.
  useEffect(() => {
    if (!autoplayActive) return;
    const id = window.setInterval(() => go(activeIndex + 1), AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [autoplayActive, activeIndex, go]);

  const slide = slides[activeIndex];
  const theme = THEMES[activeIndex % THEMES.length];

  return (
    <div
      className="relative h-[420px] overflow-hidden rounded-2xl shadow-elevated sm:h-[440px]"
      style={{ backgroundImage: theme.gradient }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      {/* Active slide — re-keyed so the copy fades in on change. */}
      <div
        key={activeIndex}
        className={`absolute inset-0 flex items-center px-16 pt-12 pb-20 duration-500 animate-in fade-in-0 sm:px-24 ${theme.text}`}
      >
        <div className="relative z-10 max-w-xl">
          {slide.eyebrow && (
            <span
              className={`inline-block rounded-full px-3.5 py-1.5 text-xs font-semibold tracking-wide uppercase ${theme.eyebrow}`}
            >
              {slide.eyebrow}
            </span>
          )}
          <h1 className="mt-4 font-display text-3xl leading-[1.07] font-bold tracking-tight text-balance sm:text-[2.5rem]">
            {slide.title}
          </h1>
          {slide.subtitle && (
            <p className="mt-3 max-w-md text-base opacity-90 sm:text-[17px]">
              {slide.subtitle}
            </p>
          )}
          {slide.cta && (
            <Button
              asChild
              className={`mt-6 h-[52px] rounded-xl px-6 text-base font-bold shadow-lift ${theme.cta}`}
            >
              <Link href={slide.href}>
                {slide.cta}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          )}
        </div>

        {/* Decorative frosted "product" panel — visual only, hidden on smaller
            viewports where the text needs the full width. */}
        {theme.panel && (
          <div
            aria-hidden="true"
            className="absolute top-1/2 right-10 hidden size-[280px] -translate-y-1/2 rounded-3xl border border-white/25 lg:block"
            style={{
              background:
                "repeating-linear-gradient(135deg, rgb(255 255 255 / 0.10) 0 14px, rgb(255 255 255 / 0.04) 14px 28px)",
            }}
          />
        )}
      </div>

      {/* Prev / next controls — sit in the side gutter, clear of the content. */}
      <button
        type="button"
        onClick={() => go(activeIndex - 1)}
        aria-label={dict.home.hero.prevSlide}
        className="absolute top-1/2 left-3 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lift transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-4 sm:size-11"
      >
        <ChevronLeft className="size-5" />
      </button>
      <button
        type="button"
        onClick={() => go(activeIndex + 1)}
        aria-label={dict.home.hero.nextSlide}
        className="absolute top-1/2 right-3 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lift transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-4 sm:size-11"
      >
        <ChevronRight className="size-5" />
      </button>

      {/* Dot indicators — aligned to the content, below it (pb reserves space).
          Each dot keeps its slim visual footprint but carries a centred 44px
          invisible hit-area (`before:` pseudo) for a comfortable tap target. */}
      <div className="absolute bottom-6 left-16 z-10 flex items-center gap-2 sm:left-24">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => go(i)}
            aria-label={dict.home.hero.goToSlide(i + 1)}
            aria-current={i === activeIndex}
            // eslint-disable-next-line tailwindcss/no-arbitrary-value -- pseudo-element requires an explicit content value; empty string is the only correct one
            className={`relative h-1.5 rounded-full transition-all before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] ${
              i === activeIndex
                ? "w-6 bg-white"
                : "w-1.5 bg-white/50 hover:bg-white/80"
            }`}
          />
        ))}
      </div>

      {/* Autoplay pause / resume — bottom-right, clear of the dots and arrows. */}
      {count > 1 && (
        <button
          type="button"
          onClick={() => setPaused((v) => !v)}
          aria-pressed={paused}
          aria-label={
            paused
              ? dict.home.hero.resumeAutoplay
              : dict.home.hero.pauseAutoplay
          }
          className="absolute right-4 bottom-6 z-10 flex size-10 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lift transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:size-11"
        >
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
        </button>
      )}
    </div>
  );
}
