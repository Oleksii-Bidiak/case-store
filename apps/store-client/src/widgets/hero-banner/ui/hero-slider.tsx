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
import { dict, HERO_CLASS } from "@/shared/config";
import { useReducedMotion } from "@/shared/lib/use-reduced-motion";
import { cn } from "@/shared/lib/utils";
import type { BannerEntity } from "@/shared/api/generated/models";
import { SlideArt, hasSlideArt, type SlideArtIcon } from "./slide-art";
import {
  SLIDE_TONES,
  slideToneFor,
  type SlideTone,
  type SlideToneKey,
} from "./slide-tone";

/** Normalised slide shape rendered by the slider (banner- or dictionary-driven). */
type HeroSlide = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  cta?: string;
  /** CTA target; a slide without one shows no button (TASK-873). */
  href?: string;
  /** Device family, sale or the ink panel (direction В colour rule). */
  tone: SlideToneKey;
  /** Admin banner picture (TASK-740), drawn in the art panel from md. */
  imageUrl?: string;
  /**
   * Big display figure on the art panel («−15%»). The dictionary fallback
   * sets it; `BannerEntity` has no such field yet, so admin slides go
   * without one.
   */
  big?: string;
  /** Placeholder art while the slide has no picture (fallback slides). */
  icon?: SlideArtIcon;
};

/** The hardcoded fallback slides — rendered when no HERO_SLIDE banners exist. */
const FALLBACK_SLIDES: readonly HeroSlide[] = dict.home.hero.slides.map(
  (s) => ({ ...s, big: s.big ?? undefined }),
);

/** Map admin-managed HERO_SLIDE banners onto the slider's normalised shape. */
function bannersToSlides(banners: BannerEntity[]): HeroSlide[] {
  return banners.map((b) => ({
    title: b.title,
    subtitle: b.subtitle ?? undefined,
    cta: b.ctaLabel ?? undefined,
    href: b.ctaHref?.trim() || undefined,
    tone: slideToneFor(b.theme),
    imageUrl: b.imageUrl ?? undefined,
  }));
}

const AUTOPLAY_MS = 7000;

/**
 * One grid cell shared by every slide layer: the active slide and the invisible
 * sizers stack in it, so the slider is as tall as its tallest slide. Padding
 * per the Homepage mockup — 28 / 24 / 72 on a phone, 40 / 40 / 80 from md; the
 * deep bottom keeps the control row clear of the CTA. From md the slide is two
 * columns, copy 1.2fr and art 1fr (6 + 5 of 11).
 */
const SLIDE_LAYER =
  "col-start-1 row-start-1 grid content-center items-center gap-4 px-6 pt-7 pb-18 md:grid-cols-11 md:gap-6 md:p-10 md:pb-20";

/** The round controls of the bottom row (pause / prev / next). */
const CONTROL =
  "flex size-11 shrink-0 items-center justify-center rounded-full bg-card/85 text-foreground transition duration-120 ease-out hover:bg-muted active:scale-94 motion-reduce:transition-none motion-reduce:active:scale-100";

/** A slim 8px dot (24px when active) with a centred 44px invisible hit-area. */
const DOT =
  "relative h-2 rounded-full transition-all duration-180 ease-out before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 motion-reduce:transition-none";

/**
 * The copy block of one slide. `sizer` renders the same box without semantics
 * (a `p` instead of the slide's h2, a `span` instead of the link) for the
 * invisible height-reserving layers — one slide heading and no hidden links.
 */
function SlideCopy({
  slide,
  tone,
  wide,
  sizer = false,
}: {
  slide: HeroSlide;
  tone: SlideTone;
  /** No art panel: the copy takes both columns. */
  wide: boolean;
  sizer?: boolean;
}) {
  // h2 since TASK-1952: the device picker above the «Акції» block is the
  // page h1. The hero role keeps its weight and tracking, but steps down to
  // the mockup's 28 → 36px (here 30 → 36) so a slide never out-shouts the h1.
  const Title = sizer ? "p" : "h2";
  const ctaClass = cn(
    "inline-flex h-12 items-center gap-2 self-start rounded-full px-5.5 text-sm font-semibold shadow-card transition duration-120 ease-out hover:ring-4 hover:ring-current/15 active:scale-98 motion-reduce:transition-none motion-reduce:active:scale-100",
    tone.cta,
    tone.focus,
  );
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-start gap-3.5",
        wide ? "md:col-span-11" : "md:col-span-6",
      )}
    >
      {slide.eyebrow && (
        // A pill tinted with the slide's own text colour, so it reads on
        // every tone without a hue of its own.
        <span className="rounded-full bg-current/12 px-3 py-1 text-xs font-bold">
          {slide.eyebrow}
        </span>
      )}
      <Title
        className={cn(
          `${HERO_CLASS}`,
          "max-w-130 text-3xl leading-tight text-balance md:text-4xl",
        )}
      >
        {slide.title}
      </Title>
      {slide.subtitle && (
        <p className="max-w-110 text-base leading-normal opacity-85">
          {slide.subtitle}
        </p>
      )}
      {slide.cta && slide.href && (
        <div className="mt-1">
          {sizer ? (
            <span className={ctaClass}>
              {slide.cta}
              <ArrowRight className="size-4" />
            </span>
          ) : (
            <Link href={slide.href} className={ctaClass}>
              {slide.cta}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * HeroSlider — the homepage promo carousel, the 2/3 column of the «Акції»
 * block (TASK-2013, Homepage mockup).
 *
 * Each slide carries its own tone (direction В: a device family, a sale, or
 * the ink panel — from the banner `theme`), so the colour means something.
 * From md a slide is two columns: the copy, and an art panel with the banner
 * picture and an optional big figure; on a phone the copy takes the slide.
 * One bottom control row: the dots on the left, then pause, previous and next
 * as light 44px buttons; the dots and focus outlines take the slide's text
 * colour, so they read on every tone.
 *
 * The height is not pinned (TASK-878): every slide's layer is stacked in one
 * grid cell — the inactive ones invisible — so the slider fits its longest
 * copy at any width and never jumps between slides, above `min-h-105
 * sm:min-h-110`. From lg it shares a row with promo tiles 1–2, which take ITS
 * height.
 *
 * Autoplay every 7s, stopped by the pause toggle, by hover or focus inside the
 * carousel, and never started under reduced motion (WCAG 2.2.2). WAI-ARIA
 * carousel pattern: a named region, each slide a group «1 з 3: …», and the
 * slide container is `aria-live="polite"` only while autoplay is off.
 *
 * `banners` (HERO_SLIDE placement) is the data source when the admin has
 * published any; otherwise the dictionary fallback slides render.
 */
interface HeroSliderProps {
  banners?: BannerEntity[];
}

export function HeroSlider({ banners }: HeroSliderProps = {}) {
  const slides: readonly HeroSlide[] =
    banners && banners.length > 0 ? bannersToSlides(banners) : FALLBACK_SLIDES;

  const [index, setIndex] = useState(0);
  const count = slides.length;

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
  const tone = SLIDE_TONES[slide.tone];

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={dict.home.hero.carouselAria}
      data-slide-tone={slide.tone}
      className={cn(
        "relative isolate grid min-h-105 overflow-hidden rounded-panel shadow-elevated transition-colors duration-500 motion-reduce:transition-none sm:min-h-110",
        tone.surface,
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <div
        aria-live={autoplayActive ? "off" : "polite"}
        className="col-start-1 row-start-1 grid"
      >
        {/* Height reservers — every other slide, invisible and inert, in the
            same grid cell, so the slider never jumps between slides. */}
        {slides.map((s, i) => {
          if (i === activeIndex) return null;
          const art = hasSlideArt(s);
          return (
            <div
              key={`sizer-${i}`}
              aria-hidden="true"
              inert
              data-slide-sizer=""
              className={cn("invisible", SLIDE_LAYER)}
            >
              <SlideCopy
                slide={s}
                tone={SLIDE_TONES[s.tone]}
                wide={!art}
                sizer
              />
              {art && <SlideArt big={s.big} icon={s.icon} sizer />}
            </div>
          );
        })}

        {/* Active slide — re-keyed so it fades in on change. */}
        <div
          key={activeIndex}
          role="group"
          aria-roledescription="slide"
          aria-label={dict.home.hero.slideAria(
            activeIndex + 1,
            count,
            slide.title,
          )}
          className={cn(
            "relative",
            SLIDE_LAYER,
            "duration-500 animate-in fade-in-0 motion-reduce:animate-none",
          )}
        >
          <SlideCopy slide={slide} tone={tone} wide={!hasSlideArt(slide)} />
          {hasSlideArt(slide) && (
            <SlideArt
              imageUrl={slide.imageUrl}
              big={slide.big}
              icon={slide.icon}
              preload={activeIndex === 0}
            />
          )}
        </div>
      </div>

      {/* One control row (Homepage mockup): dots on the left, then pause,
          previous and next. 24px in from the sides, 20px up from the bottom. */}
      <div className="absolute inset-x-6 bottom-5 z-10 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-1.5">
          {count > 1 &&
            slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => go(i)}
                aria-label={dict.home.hero.goToSlide(i + 1)}
                aria-current={i === activeIndex}
                className={cn(
                  DOT,
                  i === activeIndex
                    ? "w-6 bg-current"
                    : "w-2 bg-current/35 hover:bg-current/60",
                  tone.focus,
                )}
              />
            ))}
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => setPaused((v) => !v)}
              aria-pressed={paused}
              aria-label={
                paused
                  ? dict.home.hero.resumeAutoplay
                  : dict.home.hero.pauseAutoplay
              }
              className={cn(CONTROL, tone.focus)}
            >
              {paused ? (
                <Play aria-hidden="true" className="size-4" />
              ) : (
                <Pause aria-hidden="true" className="size-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => go(activeIndex - 1)}
              aria-label={dict.home.hero.prevSlide}
              className={cn(CONTROL, tone.focus)}
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => go(activeIndex + 1)}
              aria-label={dict.home.hero.nextSlide}
              className={cn(CONTROL, tone.focus)}
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
