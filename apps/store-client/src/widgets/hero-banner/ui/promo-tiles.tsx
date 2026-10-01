import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge, BannerBackdrop } from "@/shared/ui";
import { dict } from "@/shared/config";
import type { BannerEntity } from "@/shared/api/generated/models";

type Accent = "sale" | "primary" | "success";

/** Normalised promo-tile shape (banner- or dictionary-driven). */
type PromoTile = {
  badge?: string;
  title: string;
  text?: string;
  cta?: string;
  /** Where the tile leads; a banner without a link renders as a plain card. */
  href?: string;
  accent: Accent;
  /** Admin banner picture (TASK-740); the accent tint shows without one. */
  imageUrl?: string;
};

/** Accent rotation applied to admin banners in placement order. */
const ACCENT_CYCLE: Accent[] = ["sale", "primary", "success"];

/** The hardcoded fallback tiles — rendered when no PROMO_TILE banners exist. */
const FALLBACK_TILES: readonly PromoTile[] = dict.home.promoTiles;

/**
 * Map admin-managed PROMO_TILE banners onto the tile shape. The `theme` field,
 * when it names an accent, wins; otherwise the accent rotates by position so a
 * row of banners keeps the varied sale/primary/success look.
 */
function bannersToTiles(banners: BannerEntity[]): PromoTile[] {
  return banners.map((b, i) => {
    const themed = ACCENT_CYCLE.find((a) => a === b.theme);
    return {
      title: b.title,
      text: b.subtitle ?? undefined,
      cta: b.ctaLabel ?? undefined,
      // TASK-873 — no `#` stand-in: a banner the owner left without a link
      // is a card, not a link to the top of the page.
      href: b.ctaHref?.trim() || undefined,
      accent: themed ?? ACCENT_CYCLE[i % ACCENT_CYCLE.length],
      imageUrl: b.imageUrl ?? undefined,
    };
  });
}

// Maps each tile's accent to token-based styles + the shared Badge variant.
// Badge's `default` variant is the primary colour, so it doubles as the
// "primary" pill — no bespoke badge component needed.
const ACCENTS: Record<
  Accent,
  { surface: string; badge: "sale" | "success" | "default"; cta: string }
> = {
  sale: {
    surface: "bg-sale/10 border-sale/25",
    badge: "sale",
    cta: "text-sale",
  },
  primary: {
    surface: "bg-primary/10 border-primary/25",
    badge: "default",
    cta: "text-primary",
  },
  success: {
    surface: "bg-success/10 border-success/25",
    badge: "success",
    cta: "text-success",
  },
};

interface PromoTilesProps {
  banners?: BannerEntity[];
}

/**
 * PromoTiles — a row of promo cards under the hero. Data-driven from admin
 * PROMO_TILE banners when any are published; otherwise the hardcoded fallback
 * tiles (sale / instalments / trade-in) render unchanged. Presentational Server
 * Component; visuals stay token-based.
 */
export function PromoTiles({ banners }: PromoTilesProps = {}) {
  const tiles: readonly PromoTile[] =
    banners && banners.length > 0 ? bannersToTiles(banners) : FALLBACK_TILES;

  return (
    <div className="grid gap-5 sm:grid-cols-3">
      {tiles.map((tile, i) => {
        const accent = ACCENTS[tile.accent];
        const surface = `group relative isolate flex flex-col overflow-hidden rounded-2xl border p-6 ${accent.surface}`;
        const body = (
          <>
            {/* Admin picture under the copy (TASK-740). The tile's text is
                foreground-on-background, so the scrim is the background
                colour — the picture reads as a texture, the copy stays legible. */}
            <BannerBackdrop
              src={tile.imageUrl}
              sizes="(max-width: 639px) 100vw, 420px"
              scrimClassName="bg-background/80"
            />
            {tile.badge && (
              <Badge variant={accent.badge} className="w-fit">
                {tile.badge}
              </Badge>
            )}
            <h3 className="mt-3 font-display text-lg font-bold text-foreground">
              {tile.title}
            </h3>
            {tile.text && (
              <p className="mt-1 text-sm text-muted-foreground">{tile.text}</p>
            )}
            {tile.href && tile.cta && (
              <span
                className={`mt-4 inline-flex items-center gap-1.5 text-sm font-semibold ${accent.cta}`}
              >
                {tile.cta}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            )}
          </>
        );
        return tile.href ? (
          <Link
            key={`${tile.title}-${i}`}
            href={tile.href}
            className={`${surface} transition-shadow hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
          >
            {body}
          </Link>
        ) : (
          <div key={`${tile.title}-${i}`} className={surface}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
