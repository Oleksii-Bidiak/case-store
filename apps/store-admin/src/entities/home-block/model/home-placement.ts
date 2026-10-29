import type { HomeBlockEntity } from "@/shared/api";
import { dict } from "@/shared/config";

const h = dict.homeBlocks;

/**
 * Where a carousel stands on the homepage (plan 186, TASK-664). A carousel has no
 * placement of its own any more: the homepage blocks point at it — as a CAROUSEL
 * block of its own, or as one tab of a TABS block — and it may stand in several.
 *
 * `blockNumber` is the 1-based position of the block on the page, counted over
 * EVERY block (hidden ones included), so it is the same number the «Головна»
 * screen shows next to the block.
 */
export type CarouselHomePlacement =
  | {
      kind: "block";
      block: HomeBlockEntity;
      blockNumber: number;
    }
  | {
      kind: "tab";
      block: HomeBlockEntity;
      blockNumber: number;
      /** 1-based position of the tab inside its block. */
      tabNumber: number;
      tabCount: number;
    };

/** The blocks in page order (lower `sortOrder` = higher on the page). */
export function sortHomeBlocks(
  blocks: readonly HomeBlockEntity[],
): HomeBlockEntity[] {
  return [...blocks].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** What a block is called wherever it is named. */
export function homeBlockLabel(block: HomeBlockEntity): string {
  switch (block.type) {
    case "HERO":
      return h.hero;
    case "TRUST":
      return h.trust;
    case "CATEGORY_NAV":
      return h.categoryNav;
    case "PROMO_BANNER":
      return h.promoBanner;
    case "RECENTLY_VIEWED":
      return h.recentlyViewed;
    case "NEWSLETTER":
      return h.newsletter;
    case "CAROUSEL":
      return block.carousel?.title ?? h.carouselDeleted;
    case "TABS":
      return block.title?.trim() || h.untitledTabs;
  }
}

/**
 * Every carousel id that stands on the homepage → its placements, in page order.
 * One pass over the blocks; a carousel absent from the map stands nowhere.
 */
export function homePlacementsByCarousel(
  blocks: readonly HomeBlockEntity[],
): Map<string, CarouselHomePlacement[]> {
  const byCarousel = new Map<string, CarouselHomePlacement[]>();
  const add = (carouselId: string, placement: CarouselHomePlacement) => {
    const list = byCarousel.get(carouselId);
    if (list) list.push(placement);
    else byCarousel.set(carouselId, [placement]);
  };
  sortHomeBlocks(blocks).forEach((block, index) => {
    const blockNumber = index + 1;
    if (block.type === "CAROUSEL" && block.carousel) {
      add(block.carousel.id, { kind: "block", block, blockNumber });
    }
    if (block.type === "TABS") {
      const tabs = [...block.tabs].sort((a, b) => a.sortOrder - b.sortOrder);
      tabs.forEach((tab, tabIndex) =>
        add(tab.carousel.id, {
          kind: "tab",
          block,
          blockNumber,
          tabNumber: tabIndex + 1,
          tabCount: tabs.length,
        }),
      );
    }
  });
  return byCarousel;
}

/** «Which blocks use carousel X» — `[]` when it stands nowhere. */
export function carouselHomePlacements(
  blocks: readonly HomeBlockEntity[],
  carouselId: string,
): CarouselHomePlacement[] {
  return homePlacementsByCarousel(blocks).get(carouselId) ?? [];
}

/**
 * A placement in words: `where` — «Блок «Чохли»» / «Вкладка в «Популярне»»;
 * `position` — «блок 6» / «вкладка 2 з 3 · блок 4»; `hidden` — set when the
 * block itself is not live, so the carousel stands there but nobody sees it.
 */
export function describeHomePlacement(placement: CarouselHomePlacement): {
  where: string;
  position: string;
  hidden?: string;
} {
  const hidden =
    placement.block.status === "DRAFT"
      ? h.blockDraft
      : placement.block.status === "SCHEDULED"
        ? h.blockScheduled
        : undefined;
  if (placement.kind === "block") {
    return {
      where: h.asBlock(homeBlockLabel(placement.block)),
      position: h.blockPosition(placement.blockNumber),
      hidden,
    };
  }
  return {
    where: h.asTab(homeBlockLabel(placement.block)),
    position: h.tabPosition(
      placement.tabNumber,
      placement.tabCount,
      placement.blockNumber,
    ),
    hidden,
  };
}
