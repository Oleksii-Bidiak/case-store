import type { ReactNode } from "react";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import type { ProductControllerFindAllParams } from "@/entities/product";
import type { BannersByPlacement } from "@/shared/api/banners-server";
import type {
  PublicHomeBlockEntity,
  SiteContactSettingsEntity,
} from "@/shared/api/generated/models";
import {
  HeroBanner,
  TrustStrip,
  CategoryNav,
  PopularRail,
  RecommendationCarousels,
  PromoBanner,
  RecentlyViewed,
  Newsletter,
  firstQueryTabParams,
} from "@/widgets";

/**
 * The homepage as a sequence of blocks (TASK-663, plan 186). Order, visibility
 * and the tab sets are DATA (`GET /api/home-blocks`, admin «Головна»); which
 * component draws a block type is CODE, and lives here. Kept out of `page.tsx`
 * because a page module may only export what Next.js expects of it.
 */

/** A default block — the shape the API returns, nothing resolved. */
function defaultBlock(
  type: PublicHomeBlockEntity["type"],
  sortOrder: number,
): PublicHomeBlockEntity {
  return {
    id: `default-${type}`,
    type,
    title: null,
    sortOrder,
    status: "PUBLISHED",
    carousel: null,
    tabs: [],
  };
}

/**
 * The page the storefront renders when the API returns no block at all, or is
 * unreachable while `next build` prerenders: the hard-coded order `page.tsx`
 * had before TASK-663. The TABS block has no tabs, so it shows the query-driven
 * «Популярне» tabs; there are no CAROUSEL blocks, as there were no carousels to
 * show without the API.
 */
export const DEFAULT_HOME_BLOCKS: readonly PublicHomeBlockEntity[] = [
  defaultBlock("HERO", 0),
  defaultBlock("TRUST", 1),
  defaultBlock("CATEGORY_NAV", 2),
  defaultBlock("TABS", 3),
  defaultBlock("PROMO_BANNER", 4),
  defaultBlock("RECENTLY_VIEWED", 5),
  defaultBlock("NEWSLETTER", 6),
];

/**
 * The blocks to render: the API's, in the order it sent them, or the built-in
 * default when there are none.
 *
 * A failed read (`null` from `fetchHomeBlocks`) is NOT "no blocks": the order is
 * the owner's data now, so rendering the default over it would put hidden blocks
 * back and drop every CAROUSEL block — and ISR would keep that page for an hour.
 * At runtime it throws instead: Next keeps serving the last good ISR copy and
 * retries on the next request, and a preview shows an error rather than a
 * default that looks like the draft. Only `next build` (no earlier copy exists,
 * and the build must not need a live API) falls back to the default.
 */
export function homeBlocksOrDefault(
  blocks: readonly PublicHomeBlockEntity[] | null,
  phase: string | undefined = process.env.NEXT_PHASE,
): readonly PublicHomeBlockEntity[] {
  if (blocks === null) {
    if (phase !== PHASE_PRODUCTION_BUILD) {
      throw new Error("Homepage blocks read failed");
    }
    return DEFAULT_HOME_BLOCKS;
  }
  return blocks.length > 0 ? blocks : DEFAULT_HOME_BLOCKS;
}

/**
 * The product listings the server prefetches so the first HTML carries product
 * links (TASK-563): the first tab of every TABS block that has to query its own
 * products — i.e. one with no usable carousel tab. Blocks resolving to the same
 * query share one entry (one request, one cache key).
 */
export function homeRailPrefetchParams(
  blocks: readonly PublicHomeBlockEntity[],
): ProductControllerFindAllParams[] {
  const byKey = new Map<string, ProductControllerFindAllParams>();
  for (const block of blocks) {
    if (block.type !== "TABS") continue;
    const params = firstQueryTabParams(block.tabs);
    if (params) byKey.set(JSON.stringify(params), params);
  }
  return [...byKey.values()];
}

/** Page-level data the singleton blocks read (fetched once by `page.tsx`). */
export interface HomeBlockContext {
  banners: BannersByPlacement;
  contact: SiteContactSettingsEntity | null;
}

/**
 * The section of one block. Several TABS and several CAROUSEL blocks each get
 * their own instance. A block type this build does not know yet (the API
 * shipped ahead of the storefront) renders nothing rather than breaking the
 * page.
 */
export function renderHomeBlock(
  block: PublicHomeBlockEntity,
  { banners, contact }: HomeBlockContext,
): ReactNode {
  switch (block.type) {
    case "HERO":
      return (
        <HeroBanner
          key={block.id}
          heroSlides={banners.HERO_SLIDE}
          promoTiles={banners.PROMO_TILE}
        />
      );
    case "TRUST":
      return <TrustStrip key={block.id} />;
    case "CATEGORY_NAV":
      return <CategoryNav key={block.id} />;
    case "TABS":
      return (
        <PopularRail
          key={block.id}
          title={block.title}
          carousels={block.tabs}
        />
      );
    case "CAROUSEL":
      // An empty carousel is the backend's honest answer (plan 154);
      // RecommendationCarousels hides it, so the page never shows an empty rail.
      return block.carousel ? (
        <RecommendationCarousels key={block.id} carousels={[block.carousel]} />
      ) : null;
    case "PROMO_BANNER":
      return <PromoBanner key={block.id} banner={banners.PROMO_BANNER[0]} />;
    case "RECENTLY_VIEWED":
      return <RecentlyViewed key={block.id} />;
    case "NEWSLETTER":
      return <Newsletter key={block.id} contact={contact} />;
    default:
      return null;
  }
}
