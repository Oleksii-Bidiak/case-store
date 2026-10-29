import {
  carouselHomePlacements,
  describeHomePlacement,
  type HomeBlockEntity,
} from "@/entities/home-block";
import { formatDate, formatDateTime } from "@/shared/lib";
import { dict } from "@/shared/config";

const d = dict.homeScreen;
const c = dict.carousels;

/**
 * What one row of the «Головна» list says about its block (plan 186, TASK-662,
 * ДН-4.1/4.7/4.8) — pure, so the words are pinned by a unit test rather than by
 * reading the DOM.
 */

/** «системний» / «вкладки» / «карусель» — after the name. */
export function blockKind(block: HomeBlockEntity): string {
  if (block.type === "TABS") return d.kind.tabs;
  if (block.type === "CAROUSEL") return d.kind.carousel;
  return d.kind.system;
}

/** The muted line: where the content comes from, and where to change it. */
export function blockSummary(block: HomeBlockEntity): string {
  switch (block.type) {
    case "HERO":
      return d.summary.hero;
    case "TRUST":
      return d.summary.trust;
    case "CATEGORY_NAV":
      return d.summary.categoryNav;
    case "PROMO_BANNER":
      return d.summary.promoBanner;
    case "RECENTLY_VIEWED":
      return d.summary.recentlyViewed;
    case "NEWSLETTER":
      return d.summary.newsletter;
    case "TABS":
      return d.tabsSummary(block.tabs.length);
    case "CAROUSEL": {
      const carousel = block.carousel;
      if (!carousel) return d.orphanSummary;
      const source =
        carousel.source === "MANUAL" || carousel.source === "CATEGORY"
          ? c.sourceLabels[carousel.source]
          : c.sourceAuto(c.sourceLabels[carousel.source]);
      return carousel.status === "PUBLISHED"
        ? source
        : `${source} · ${d.carouselNotPublished}`;
    }
  }
}

/** The tab names of a TABS block, in tab order (the chips under the summary). */
export function blockTabs(block: HomeBlockEntity): string[] {
  return [...block.tabs]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((tab) => tab.carousel.title);
}

/**
 * Why the site shows nothing for this block — the yellow row (ДН-4.8). `null` for a
 * block that draws something. Driven by the API's `isOrphaned` / `isEmpty`, which
 * resolve products exactly as the homepage does.
 */
export function blockProblem(block: HomeBlockEntity): string | null {
  if (block.isOrphaned) return d.warnOrphaned;
  if (!block.isEmpty) return null;
  if (block.type === "TABS") return d.warnTabsEmpty;
  if (block.carousel && block.carousel.status !== "PUBLISHED") {
    return d.warnCarouselNotPublished(block.carousel.title);
  }
  return d.warnCarouselEmpty;
}

/** «Показується» / «Сховано» / «Заплановано» — the switch's state in words. */
export function blockShownLabel(block: HomeBlockEntity): string {
  if (block.status === "PUBLISHED") return d.shown;
  if (block.status === "SCHEDULED") return d.scheduled;
  return d.hidden;
}

/** A scheduled block: the badge («з 28.11.2026, 00:00») and the line under it. */
export function blockSchedule(
  block: HomeBlockEntity,
): { badge: string; note: string } | null {
  if (block.status !== "SCHEDULED" || !block.scheduledAt) return null;
  return {
    badge: d.scheduledFrom(formatDateTime(block.scheduledAt)),
    note: d.warnScheduled(formatDate(block.scheduledAt)),
  };
}

/**
 * The same carousel placed again elsewhere on the page (allowed, ДН-4.5) — a quiet
 * note on a CAROUSEL block: «…ще й як Вкладка в «Популярне»…». `null` when unique.
 */
export function blockDuplicateNote(
  block: HomeBlockEntity,
  blocks: readonly HomeBlockEntity[],
): string | null {
  if (block.type !== "CAROUSEL" || !block.carousel) return null;
  const elsewhere = carouselHomePlacements(blocks, block.carousel.id).filter(
    (placement) => placement.block.id !== block.id,
  );
  if (elsewhere.length === 0) return null;
  return d.duplicateNote(
    elsewhere.map((p) => describeHomePlacement(p).where).join(", "),
  );
}
