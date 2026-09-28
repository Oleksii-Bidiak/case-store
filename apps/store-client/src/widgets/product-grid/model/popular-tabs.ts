import type { ProductControllerFindAllParams } from "@/entities/product";
import type {
  PublicCarouselEntity,
  PublicProductEntity,
} from "@/shared/api/generated/models";
import { dict } from "@/shared/config";

/**
 * The «Популярне» rail's tab model — a plain module (no `"use client"`) since
 * TASK-563, because the homepage calls {@link firstQueryTabParams} on the
 * server to prefetch the rail it is about to render.
 */

/**
 * Fallback tabs — used ONLY when no HOME_TABS carousel is available (fresh
 * install, everything unpublished, or an unreachable API, which yields an empty
 * list by design). Each is backed by a real server-side filter:
 *   • hits → bestselling: units sold across PAID orders, most sold first (TASK-164)
 *   • new  → newest first (createdAt desc)
 *   • sale → `onSale: true` — the discounted set is computed by the API, NOT by
 *            filtering a page client-side (which used to leave the tab looking
 *            empty whenever the first page held few discounted items).
 */
const FALLBACK_TABS: QueryTab[] = [
  {
    key: "hits",
    label: dict.home.popular.tabs.hits,
    params: {
      isActive: true,
      sortBy: "bestselling",
      sortOrder: "desc",
      limit: 12,
    },
  },
  {
    key: "new",
    label: dict.home.popular.tabs.new,
    params: {
      isActive: true,
      sortBy: "createdAt",
      sortOrder: "desc",
      limit: 12,
    },
  },
  {
    key: "sale",
    label: dict.home.popular.tabs.sale,
    params: { isActive: true, onSale: true, limit: 12 },
  },
];

/** A tab whose products were resolved server-side (an admin HOME_TABS carousel). */
export interface CarouselTab {
  key: string;
  label: string;
  products: PublicProductEntity[];
}

/** A tab that fetches its own products client-side (fallback mode only). */
export interface QueryTab {
  key: string;
  label: string;
  params: ProductControllerFindAllParams;
}

export type RailTab = CarouselTab | QueryTab;

export function isCarouselTab(tab: RailTab): tab is CarouselTab {
  return "products" in tab;
}

/**
 * Admin-managed HOME_TABS carousels become the tabs (title = tab label, resolved
 * products = tab content). A carousel that resolved to zero products is dropped —
 * a tab that opens onto nothing is worse than no tab.
 */
export function toTabs(carousels: PublicCarouselEntity[]): RailTab[] {
  const tabs: CarouselTab[] = carousels
    .filter((carousel) => carousel.products.length > 0)
    .map((carousel) => ({
      key: carousel.id,
      label: carousel.title,
      products: carousel.products,
    }));

  // Fallback (never an empty hole on the homepage): with no usable carousel the
  // rail behaves exactly as it did before TASK-288. The section carries the
  // homepage's product discovery, and `fetchPublishedCarousels` returns [] on any
  // transport error — hiding the section would mean a brief API outage silently
  // guts the homepage. Same posture as the banner regions falling back to their
  // hardcoded content.
  return tabs.length > 0 ? tabs : FALLBACK_TABS;
}

/**
 * The listing query the rail's FIRST tab runs on mount, or `null` when that tab
 * needs none (a carousel tab arrives with its products already resolved).
 *
 * The homepage prefetches exactly this on the server (TASK-563): in fallback
 * mode the rail used to reach the first HTML as a skeleton, i.e. a homepage with
 * no link to any product whenever no carousel was published.
 */
export function firstQueryTabParams(
  carousels: PublicCarouselEntity[],
): ProductControllerFindAllParams | null {
  const [first] = toTabs(carousels);
  return first && !isCarouselTab(first) ? first.params : null;
}
