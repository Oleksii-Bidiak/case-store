"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";

const d = dict.bannerPreview;

/**
 * Placement slots — structural mirror of `BANNER_PLACEMENT` in
 * `features/banner-form/model/banner-schema.ts` (and of the API's
 * BannerPlacement enum). Redeclared here because shared/ui cannot import
 * upward from features (FSD); the form's `BannerPlacementValue` is exactly
 * this union, so callers pass it with no cast.
 */
export type BannerPreviewPlacement =
  | "HERO_SLIDE"
  | "PROMO_TILE"
  | "PROMO_BANNER"
  | "ANNOUNCEMENT_BAR";

export interface BannerPlacementPreviewProps {
  placement: BannerPreviewPlacement;
  title: string;
  subtitle?: string;
  /** Accepted for prop-parity with the banner form, but currently unused: none
   *  of the four storefront placements reads `imageUrl` (see header comment). */
  imageUrl?: string;
  ctaLabel?: string;
  ctaHref?: string;
  theme?: string;
}

/**
 * BannerPlacementPreview (plan 137, TASK-265) — a purely presentational,
 * simplified reconstruction of how each `BannerPlacement` renders on the
 * storefront, so the admin sees roughly what they're building while typing.
 * Props-only: no Orval hooks, no react-hook-form — the owning form watches its
 * fields and passes live values down (same shape as `SeoSnippetPreview`).
 *
 * Documented single-banner simplifications vs the storefront originals
 * (`apps/store-client/src/widgets/...`, read-only visual reference):
 *
 * - HERO_SLIDE (`hero-banner/ui/hero-slider.tsx`): the real slider picks one of
 *   3 gradient themes by array position (`THEMES[index % 3]`). A standalone
 *   preview has no position, so it always renders THEMES[0] (indigo→violet,
 *   white text). Carousel chrome (arrows/dots/autoplay) is omitted.
 * - PROMO_TILE (`hero-banner/ui/promo-tiles.tsx`): accent resolves from `theme`
 *   when it literally matches "sale" | "primary" | "success"; the storefront
 *   otherwise rotates accents by position, which a single preview can't
 *   reconstruct — it defaults to "primary".
 * - PROMO_BANNER (`promo-banner/ui/promo-banner.tsx`): the CTA button renders
 *   only when BOTH `ctaLabel` and `ctaHref` are present — mirrored exactly.
 * - ANNOUNCEMENT_BAR (`header/ui/announcement-bar.tsx`): the real strip uses
 *   ONLY `title` and `ctaHref`; subtitle/ctaLabel/imageUrl/theme are ignored,
 *   and the preview reflects that (plus a hint so the admin isn't misled).
 * - `imageUrl` is currently ignored by ALL four storefront placements, so no
 *   variant renders it here either.
 *
 * The mobile/desktop segmented toggle simulates the storefront viewport by
 * constraining the preview's width — pure local display state (not form data,
 * so docs/conventions/forms.md seeding rules don't apply).
 */
export function BannerPlacementPreview({
  placement,
  title,
  subtitle,
  ctaLabel,
  ctaHref,
  theme,
}: BannerPlacementPreviewProps) {
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");

  const variant: VariantProps = {
    title,
    subtitle: subtitle?.trim() || undefined,
    ctaLabel: ctaLabel?.trim() || undefined,
    ctaHref: ctaHref?.trim() || undefined,
    theme: theme?.trim() || undefined,
  };

  return (
    <section
      aria-label={d.heading}
      data-testid="banner-placement-preview"
      className="flex flex-col gap-3 rounded-md border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {d.heading}
        </p>
        <div className="inline-flex items-center rounded-lg bg-muted p-1">
          <ViewportButton
            label={d.viewportDesktop}
            active={viewport === "desktop"}
            onClick={() => setViewport("desktop")}
          />
          <ViewportButton
            label={d.viewportMobile}
            active={viewport === "mobile"}
            onClick={() => setViewport("mobile")}
          />
        </div>
      </div>

      <div
        data-testid="banner-preview-frame"
        className={cn("w-full", viewport === "mobile" && "max-w-[375px]")}
      >
        {placement === "HERO_SLIDE" && <HeroSlidePreview {...variant} />}
        {placement === "PROMO_TILE" && <PromoTilePreview {...variant} />}
        {placement === "PROMO_BANNER" && <PromoBannerPreview {...variant} />}
        {placement === "ANNOUNCEMENT_BAR" && (
          <AnnouncementBarPreview {...variant} />
        )}
      </div>

      {placement === "ANNOUNCEMENT_BAR" && (
        <p className="text-xs text-muted-foreground">{d.announcementBarNote}</p>
      )}
    </section>
  );
}

/** Segmented viewport-simulation button (Tabs-like look, plain button role).
 *  `type="button"` is load-bearing: the preview mounts inside the banner
 *  `<form>` and must never trigger a submit. */
function ViewportButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

interface VariantProps {
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
  theme?: string;
}

/** `title || dict.bannerPreview.emptyTitle` with italic-muted styling when
 *  empty, so the panel never looks broken before the admin types anything. */
function TitleText({ title, className }: { title: string; className: string }) {
  const isEmpty = !title.trim();
  return (
    <p className={cn(className, isEmpty && "italic opacity-70")}>
      {isEmpty ? d.emptyTitle : title}
    </p>
  );
}

// THEMES[0] gradient from the storefront hero slider (see header comment).
// The oklch()/color-mix() values here — like PROMO_BANNER's from-slate-900/
// to-primary classes below — are intentional 1:1 ports of the storefront's
// token-derived gradients (hero-slider.tsx / promo-banner.tsx), not new raw
// colors introduced by the admin.
const HERO_GRADIENT =
  "linear-gradient(120deg, color-mix(in oklab, var(--color-primary) 90%, black) 0%, var(--color-primary) 52%, color-mix(in oklab, var(--color-primary) 55%, oklch(0.55 0.2 300)) 100%)";

function HeroSlidePreview({ title, subtitle, ctaLabel }: VariantProps) {
  return (
    <div
      data-testid="banner-preview-hero-slide"
      className="flex min-h-[260px] items-center overflow-hidden rounded-2xl px-8 py-10 text-white"
      style={{ backgroundImage: HERO_GRADIENT }}
    >
      <div className="max-w-md">
        <TitleText
          title={title}
          className="font-display text-2xl leading-tight font-bold tracking-tight text-balance"
        />
        {subtitle && <p className="mt-3 text-sm opacity-90">{subtitle}</p>}
        {ctaLabel && (
          <span className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-primary">
            {ctaLabel}
            <ArrowRight className="size-4" />
          </span>
        )}
      </div>
    </div>
  );
}

// Accent styles from the storefront promo tiles (token-based, admin has the
// same sale/primary/success tokens in globals.css).
const TILE_ACCENTS = {
  sale: { surface: "bg-sale/10 border-sale/25", cta: "text-sale" },
  primary: { surface: "bg-primary/10 border-primary/25", cta: "text-primary" },
  success: { surface: "bg-success/10 border-success/25", cta: "text-success" },
} as const;

type TileAccent = keyof typeof TILE_ACCENTS;

const TILE_ACCENT_NAMES = Object.keys(TILE_ACCENTS) as TileAccent[];

function PromoTilePreview({ title, subtitle, ctaLabel, theme }: VariantProps) {
  // `theme` wins only when it literally names an accent; otherwise the
  // storefront rotates by position — a single preview defaults to "primary"
  // (documented simplification, see header comment).
  const accent =
    TILE_ACCENTS[TILE_ACCENT_NAMES.find((a) => a === theme) ?? "primary"];
  return (
    <div
      data-testid="banner-preview-promo-tile"
      className={cn("flex flex-col rounded-2xl border p-6", accent.surface)}
    >
      <TitleText
        title={title}
        className="font-display text-lg font-bold text-foreground"
      />
      {subtitle && (
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      )}
      {ctaLabel && (
        <span
          className={cn(
            "mt-4 inline-flex items-center gap-1.5 text-sm font-semibold",
            accent.cta,
          )}
        >
          {ctaLabel}
          <ArrowRight className="size-4" />
        </span>
      )}
    </div>
  );
}

function PromoBannerPreview({
  title,
  subtitle,
  ctaLabel,
  ctaHref,
}: VariantProps) {
  return (
    <div
      data-testid="banner-preview-promo-banner"
      className="flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-gradient-to-r from-slate-900 to-primary p-8"
    >
      <div className="max-w-md text-white">
        <TitleText
          title={title}
          className="font-display text-xl leading-tight font-bold tracking-tight text-balance"
        />
        {subtitle && <p className="mt-2 text-sm text-white/80">{subtitle}</p>}
      </div>
      {ctaLabel && ctaHref && (
        <span className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          {ctaLabel}
          <ArrowRight className="size-4" />
        </span>
      )}
    </div>
  );
}

function AnnouncementBarPreview({ title, ctaHref }: VariantProps) {
  return (
    <div
      data-testid="banner-preview-announcement-bar"
      className="overflow-hidden rounded-md bg-foreground text-background"
    >
      <div className="flex h-10 items-center gap-2 px-4 text-[13px]">
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-success"
        />
        <TitleText
          title={title}
          className={cn("truncate", ctaHref && "underline underline-offset-2")}
        />
      </div>
    </div>
  );
}
