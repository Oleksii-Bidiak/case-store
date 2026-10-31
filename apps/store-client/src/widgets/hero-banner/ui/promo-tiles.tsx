import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Percent, Truck, type LucideIcon } from "lucide-react";
import { BannerBackdrop } from "@/shared/ui";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import type { BannerEntity } from "@/shared/api/generated/models";

/**
 * How many promo tiles the first screen has room for (TASK-2013): two beside
 * the slider, three in a row under it. store-api refuses a sixth active
 * PROMO_TILE banner (409 `BANNER_PROMO_TILE_LIMIT`); rows from before that rule
 * may still exceed it, so the storefront caps the list too.
 */
export const MAX_PROMO_TILES = 5;

/** Tiles 1–2 stand beside the slider; the rest go to the row beneath it. */
export const PROMO_TILES_BESIDE = 2;

type TileIcon = (typeof dict.home.promoTiles)[number]["icon"];

const ICONS: Record<TileIcon, LucideIcon> = {
  percent: Percent,
  truck: Truck,
};

/** Normalised promo-tile shape (banner- or dictionary-driven). */
type PromoTile = {
  title: string;
  text?: string;
  cta?: string;
  /** Where the tile leads; a banner without a link renders as a plain card. */
  href?: string;
  /** Surface tone class — `bg-card` unless the banner names a tone. */
  tone: string;
  /** The fallback tiles carry an icon; banners have no icon field yet. */
  icon?: TileIcon;
  /** Admin banner picture (TASK-740), drawn behind the copy. */
  imageUrl?: string;
};

const NEUTRAL_TONE = "bg-card";

/**
 * The banner `theme` → the tile surface (direction В colour rule: a hue only
 * ever means a device family — or a sale). A family key gives the family tone;
 * the three accents the admin palette still offers stay as faint tints, since
 * the owner picked them on purpose. No theme, or an unknown one, is a white
 * card: the old by-position sale / primary / success rotation is gone.
 */
const TONES: Record<string, string> = {
  iphone: "bg-family-iphone",
  galaxy: "bg-family-galaxy",
  redmi: "bg-family-redmi",
  watch: "bg-family-watch",
  ipad: "bg-family-ipad",
  sale: "bg-sale/10",
  primary: "bg-primary/10",
  success: "bg-success/10",
};

function toneFor(theme: string | null | undefined): string {
  const key = theme?.trim().toLowerCase();
  return (key && TONES[key]) || NEUTRAL_TONE;
}

/**
 * The tiles to draw: the admin PROMO_TILE banners (in placement order) when any
 * are published, otherwise the dictionary fallback — never more than
 * {@link MAX_PROMO_TILES}.
 */
export function resolvePromoTiles(banners?: BannerEntity[]): PromoTile[] {
  const tiles: PromoTile[] =
    banners && banners.length > 0
      ? banners.map((b) => ({
          title: b.title,
          text: b.subtitle ?? undefined,
          cta: b.ctaLabel ?? undefined,
          // TASK-873 — no `#` stand-in: a banner the owner left without a
          // link is a card, not a link to the top of the page.
          href: b.ctaHref?.trim() || undefined,
          tone: toneFor(b.theme),
          imageUrl: b.imageUrl ?? undefined,
        }))
      : dict.home.promoTiles.map((t) => ({ ...t, tone: NEUTRAL_TONE }));
  return tiles.slice(0, MAX_PROMO_TILES);
}

const TILE_BASE =
  "group relative isolate flex h-full min-h-37.5 flex-col gap-1.5 overflow-hidden rounded-card p-5 text-foreground shadow-card";

/** Lift on hover, press on tap, focus ring; transforms off under reduced motion. */
const TILE_LINK =
  "transition-[box-shadow,transform] duration-180 ease-out hover:-translate-y-0.5 hover:shadow-lift active:scale-99 active:shadow-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100";

function PromoTileCard({ tile, sizes }: { tile: PromoTile; sizes: string }) {
  const Icon = tile.icon ? ICONS[tile.icon] : undefined;
  const neutral = tile.tone === NEUTRAL_TONE;
  const body = (
    <>
      {/* Admin picture under the copy (TASK-740). The copy is foreground on the
          tile, so the scrim is the card colour — the picture reads as a
          texture and the text stays legible. */}
      <BannerBackdrop
        src={tile.imageUrl}
        sizes={sizes}
        scrimClassName="bg-card/80"
      />
      {Icon && (
        <span
          aria-hidden="true"
          className={cn(
            "mb-1.5 flex size-10 items-center justify-center rounded-menu",
            neutral ? "bg-muted" : "bg-card",
          )}
        >
          <Icon className="size-5" />
        </span>
      )}
      <h3 className="font-display text-lg leading-tight font-bold">
        {tile.title}
      </h3>
      {tile.text && (
        <p className="text-sm leading-snug text-muted-foreground">
          {tile.text}
        </p>
      )}
      {tile.href && tile.cta && (
        <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-semibold">
          {tile.cta}
          <ArrowRight
            aria-hidden="true"
            className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
          />
        </span>
      )}
    </>
  );

  return tile.href ? (
    <Link
      href={tile.href}
      data-promo-tile=""
      className={cn(TILE_BASE, tile.tone, TILE_LINK)}
    >
      {body}
    </Link>
  ) : (
    <div data-promo-tile="" className={cn(TILE_BASE, tile.tone)}>
      {body}
    </div>
  );
}

/** Below-the-block row: three equal columns from md, two for exactly two. */
const BELOW_COLUMNS: Record<number, string> = {
  1: "",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
};

interface PromoShowcaseProps {
  /** The hero slider (a client component, passed in by HeroBanner). */
  slider: ReactNode;
  /** PROMO_TILE banners (falls back to the dictionary tiles when empty). */
  banners?: BannerEntity[];
}

/**
 * PromoShowcase — the «slider + promo tiles» block (TASK-2013, Д3-0 / Homepage
 * Д3-2). Up to five tiles:
 *
 * - tiles 1–2 stand to the RIGHT of the slider from `lg` (slider 2/3, tile
 *   column 1/3, the tiles splitting the slider's height); below `lg` they stack
 *   under it, full width;
 * - tiles 3–5 form one row UNDER the whole block — 3 columns from `md`
 *   (2 when there are exactly two), stacked on a phone.
 *
 * With one tile it fills the side column's height; with none the slider spans
 * the full width. The mockup's 992px step is `lg` (1024) here — the repo has
 * no custom breakpoints. Presentational Server Component.
 */
export function PromoShowcase({ slider, banners }: PromoShowcaseProps) {
  const tiles = resolvePromoTiles(banners);
  const beside = tiles.slice(0, PROMO_TILES_BESIDE);
  const below = tiles.slice(PROMO_TILES_BESIDE);

  return (
    <>
      <div
        data-promo-row="top"
        className={cn(beside.length > 0 && "grid gap-3 lg:grid-cols-3")}
      >
        <div className={cn("min-w-0", beside.length > 0 && "lg:col-span-2")}>
          {slider}
        </div>
        {beside.length > 0 && (
          <div
            data-promo-slot="beside"
            className={cn(
              "grid gap-3",
              beside.length > 1 ? "lg:grid-rows-2" : "lg:grid-rows-1",
            )}
          >
            {beside.map((tile, i) => (
              <PromoTileCard
                key={`${tile.title}-${i}`}
                tile={tile}
                sizes="(max-width: 1023px) 100vw, 440px"
              />
            ))}
          </div>
        )}
      </div>

      {below.length > 0 && (
        <div
          data-promo-slot="below"
          className={cn("mt-3 grid gap-3", BELOW_COLUMNS[below.length])}
        >
          {below.map((tile, i) => (
            <PromoTileCard
              key={`${tile.title}-${i}`}
              tile={tile}
              sizes="(max-width: 767px) 100vw, 440px"
            />
          ))}
        </div>
      )}
    </>
  );
}
