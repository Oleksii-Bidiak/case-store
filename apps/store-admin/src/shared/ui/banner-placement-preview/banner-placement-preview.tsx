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
  "HERO_SLIDE" | "PROMO_TILE" | "PROMO_BANNER" | "ANNOUNCEMENT_BAR";

export interface BannerPlacementPreviewProps {
  placement: BannerPreviewPlacement;
  title: string;
  subtitle?: string;
  /** The banner picture — drawn behind the copy on the three homepage
   *  placements, as the storefront does since TASK-740 (see header comment). */
  imageUrl?: string;
  ctaLabel?: string;
  ctaHref?: string;
  theme?: string;
  /** PROMO_TILE only (TASK-2013): which of the five storefront slots this tile
   *  takes, 1-based — the form derives it from the banner list. Defaults to 1. */
  promoTileSlot?: number;
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
 * - PROMO_TILE (`hero-banner/ui/promo-tiles.tsx`): the tint resolves from
 *   `theme` when it literally matches "sale" | "primary" | "success"; anything
 *   else is a white card, as on the storefront since TASK-2013 (no rotation by
 *   position any more). The storefront also honours device-family keys
 *   (iphone, galaxy…) — the admin has no family tokens yet, so those preview
 *   as the white card.
 * - PROMO_BANNER (`promo-banner/ui/promo-banner.tsx`): the CTA button renders
 *   only when BOTH `ctaLabel` and `ctaHref` are present — mirrored exactly.
 * - ANNOUNCEMENT_BAR (`header/ui/announcement-bar.tsx`): the real strip uses
 *   ONLY `title` and `ctaHref`; subtitle/ctaLabel/imageUrl/theme are ignored,
 *   and the preview reflects that (plus a hint so the admin isn't misled).
 * - `imageUrl`: TASK-740 taught the storefront to draw it (`BannerBackdrop`:
 *   a cover picture under a tint, over the gradient) on HERO_SLIDE, PROMO_TILE
 *   and PROMO_BANNER, so since wave 198 (TASK-1073) the preview draws it the same
 *   way, with the same tints. The announcement bar still has no picture, and
 *   neither does its preview. A picture that fails to load is dropped, exactly
 *   as the storefront drops it.
 *
 * SHAPE (TASK-429). Before this, the preview constrained WIDTH only, so every
 * placement rendered at "whatever the 360px side panel is wide" with a height that
 * came from its own padding — 1:1 with nothing on the storefront. Each variant now
 * carries the proportions of its real slot, measured from store-client:
 *
 * - HERO_SLIDE       fixed shape: ≈968×440 desktop (`aspect-banner-hero`), and
 *                    375×420 on a phone (`aspect-banner-hero-mobile`) — below `lg`
 *                    the slider is full width, so the shape is TALLER than wide.
 * - PROMO_TILE       The «slider + tiles» block (TASK-2013): slider 2/3 with slots
 *                    1–2 stacked beside it, slots 3–5 in a row of thirds under it.
 *                    The tile is drawn in ITS slot (`promoTileSlot`), the other
 *                    slots and the slider as dimmed numbered frames. Below `lg`
 *                    the storefront stacks tiles full width, so the phone view
 *                    shows the tile alone.
 * - PROMO_BANNER     NO fixed ratio (content height), full content width.
 * - ANNOUNCEMENT_BAR fixed 40px strip (`h-10`), full page width.
 *
 * The two content-height placements are NOT given an invented ratio; the panel says
 * so in words instead. Ratios are expressed with `aspect-*` design tokens (declared
 * in `app/globals.css`) — never a padding-bottom hack, absolute positioning, or an
 * arbitrary Tailwind value.
 *
 * The mobile/desktop segmented toggle simulates the storefront viewport by
 * constraining the preview's width AND by switching the shapes that differ between
 * breakpoints — pure local display state (not form data, so
 * docs/conventions/forms.md seeding rules don't apply).
 */
export function BannerPlacementPreview({
  placement,
  title,
  subtitle,
  imageUrl,
  ctaLabel,
  ctaHref,
  theme,
  promoTileSlot,
}: BannerPlacementPreviewProps) {
  const [viewport, setViewport] = useState<Viewport>("desktop");

  const variant: VariantProps = {
    title,
    imageUrl: imageUrl?.trim() || undefined,
    subtitle: subtitle?.trim() || undefined,
    ctaLabel: ctaLabel?.trim() || undefined,
    ctaHref: ctaHref?.trim() || undefined,
    theme: theme?.trim() || undefined,
    viewport,
    promoTileSlot,
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

      {/* `max-w-sm` (384px) stands in for a phone — the token nearest the 375px
          reference width, and a real token rather than an arbitrary value. */}
      <div
        data-testid="banner-preview-frame"
        className={cn("w-full", viewport === "mobile" && "max-w-sm")}
      >
        {placement === "HERO_SLIDE" && <HeroSlidePreview {...variant} />}
        {placement === "PROMO_TILE" && <PromoTilePreview {...variant} />}
        {placement === "PROMO_BANNER" && <PromoBannerPreview {...variant} />}
        {placement === "ANNOUNCEMENT_BAR" && (
          <AnnouncementBarPreview {...variant} />
        )}
      </div>

      {/* What shape the operator is looking at — including the honest "no fixed
          height" for the two content-height placements (TASK-429). */}
      <p
        data-testid="banner-preview-shape-note"
        className="text-xs text-muted-foreground"
      >
        {d.shape[placement]}
      </p>
      <p className="text-xs text-muted-foreground">{d.scaleNote}</p>

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

/** Which storefront breakpoint the preview is modelling. */
type Viewport = "desktop" | "mobile";

interface VariantProps {
  title: string;
  imageUrl?: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
  theme?: string;
  /** Drives the shapes that genuinely differ between breakpoints (hero ratio,
   *  promo-tile column count) — see the component header. */
  viewport: Viewport;
  promoTileSlot?: number;
}

/**
 * The banner picture behind the copy — the admin twin of the storefront
 * `BannerBackdrop` (TASK-740): a cover image under the placement's tint, on a
 * `-z-10` layer of an `isolate` box. Renders nothing without a URL or when the
 * picture fails to load, so the gradient shows exactly as on the site.
 */
function PreviewBackdrop({
  src,
  scrimClassName,
}: {
  src?: string;
  scrimClassName: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return null;
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10">
      {/* eslint-disable-next-line @next/next/no-img-element -- a live preview of an operator-supplied URL; next/image would need every host allow-listed */}
      <img
        data-testid="banner-preview-image"
        src={src}
        alt=""
        className="size-full object-cover"
        onError={() => setFailedSrc(src)}
      />
      <div className={cn("absolute inset-0", scrimClassName)} />
    </div>
  );
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

/**
 * The hero's REAL proportions, per breakpoint (TASK-429). Tokens, not arbitrary
 * values: see `--aspect-banner-hero*` in `app/globals.css` for the measurements.
 * The old `min-h-[260px]` was a made-up number — the storefront slide is 440px tall
 * in a ≈968px column, more than twice as wide as it is tall, which is nothing like
 * the near-square box the panel used to show.
 */
const HERO_ASPECT: Record<Viewport, string> = {
  desktop: "aspect-banner-hero",
  mobile: "aspect-banner-hero-mobile",
};

function HeroSlidePreview({
  title,
  subtitle,
  imageUrl,
  ctaLabel,
  viewport,
}: VariantProps) {
  return (
    <div
      data-testid="banner-preview-hero-slide"
      className={cn(
        "relative isolate flex items-center overflow-hidden rounded-2xl p-4 text-white",
        HERO_ASPECT[viewport],
      )}
      style={{ backgroundImage: HERO_GRADIENT }}
    >
      <PreviewBackdrop src={imageUrl} scrimClassName="bg-black/45" />
      {/* The copy block sits on the left half exactly as it does on the site; the
          scale model is small, so the padding and type scale come down with it —
          the shape is what has to be faithful, not the font size. */}
      <div className="min-w-0 max-w-md">
        <TitleText
          title={title}
          className="font-display text-lg leading-tight font-bold tracking-tight text-balance"
        />
        {subtitle && <p className="mt-2 text-xs opacity-90">{subtitle}</p>}
        {ctaLabel && (
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-primary">
            {ctaLabel}
            <ArrowRight className="size-3.5" />
          </span>
        )}
      </div>
    </div>
  );
}

// Tile surfaces from the storefront promo tiles (TASK-2013): a tint only for
// the three accents the admin palette offers, a white card otherwise.
const TILE_TINTS = {
  sale: "bg-sale/10 border-sale/25",
  primary: "bg-primary/10 border-primary/25",
  success: "bg-success/10 border-success/25",
} as const;

type TileTint = keyof typeof TILE_TINTS;

const TILE_TINT_NAMES = Object.keys(TILE_TINTS) as TileTint[];

/** The storefront's five promo-tile slots: two beside the slider, three under. */
const PROMO_SLOTS = [1, 2, 3, 4, 5] as const;

function PromoTilePreview({
  title,
  subtitle,
  imageUrl,
  ctaLabel,
  theme,
  viewport,
  promoTileSlot,
}: VariantProps) {
  const tint = TILE_TINT_NAMES.find((a) => a === theme?.toLowerCase());
  const slot = Math.min(Math.max(Math.round(promoTileSlot ?? 1), 1), 5);

  const tile = (
    <div
      data-testid="banner-preview-promo-tile"
      className={cn(
        "relative isolate flex h-full flex-col overflow-hidden rounded-2xl border p-3",
        tint ? TILE_TINTS[tint] : "border-border bg-card shadow-sm",
      )}
    >
      <PreviewBackdrop src={imageUrl} scrimClassName="bg-card/80" />
      <TitleText
        title={title}
        className="font-display text-sm font-bold text-foreground"
      />
      {subtitle && (
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      )}
      {ctaLabel && (
        <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-semibold text-foreground">
          {ctaLabel}
          <ArrowRight className="size-3.5" />
        </span>
      )}
    </div>
  );

  // Below `lg` the storefront stacks every tile full width, so the phone view
  // shows the tile alone. On a desktop it is the «slider + tiles» block: the
  // slider over two thirds and two rows, slots 1–2 beside it, slots 3–5 in a row
  // under it — the tile in ITS slot, every other place a numbered frame. Auto
  // placement does the layout: slider first, then the slots in order. NO aspect
  // ratio on the tiles: they are content-height on the site.
  if (viewport === "mobile") return tile;

  return (
    <div
      data-testid="banner-preview-promo-layout"
      className="grid grid-cols-3 gap-1.5"
    >
      <GhostFrame
        label={d.sliderGhost}
        className="col-span-2 row-span-2 min-h-28"
      />
      {PROMO_SLOTS.map((n) =>
        n === slot ? (
          <div key={n} data-promo-slot={n} className="min-w-0">
            {tile}
          </div>
        ) : (
          <GhostFrame key={n} label={d.tileSlot(n)} className="min-h-12" />
        ),
      )}
    </div>
  );
}

/** A neighbouring place in the block, drawn as an empty numbered frame: it
 *  conveys the layout without pretending to be content. `aria-hidden` — the
 *  shape note under the preview says the same thing in words. */
function GhostFrame({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <div
      aria-hidden="true"
      data-ghost-frame=""
      className={cn(
        "flex items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 text-xs text-muted-foreground",
        className,
      )}
    >
      {label}
    </div>
  );
}

function PromoBannerPreview({
  title,
  subtitle,
  imageUrl,
  ctaLabel,
  ctaHref,
}: VariantProps) {
  return (
    <div
      data-testid="banner-preview-promo-banner"
      // Full content width, CONTENT height — the storefront banner is
      // `max-w-7xl px-4` with `p-10 sm:p-12` and no ratio at all, so none is
      // invented here (TASK-429); the padding is scaled down with the model.
      className="relative isolate flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 to-primary p-5"
    >
      <PreviewBackdrop src={imageUrl} scrimClassName="bg-slate-900/60" />
      <div className="min-w-0 max-w-md text-white">
        <TitleText
          title={title}
          className="font-display text-base leading-tight font-bold tracking-tight text-balance"
        />
        {subtitle && <p className="mt-1.5 text-xs text-white/80">{subtitle}</p>}
      </div>
      {ctaLabel && ctaHref && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          {ctaLabel}
          <ArrowRight className="size-3.5" />
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
      {/* 1:1 with the storefront strip, not a scale model: `h-10` IS the real 40px
          and the 13px type is the real type — the only placement whose height is a
          constant, so there is nothing to scale. */}
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
