import {
  homeBlockLabel,
  sortHomeBlocks,
  type HomeBlockEntity,
} from "@/entities/home-block";
import { dict } from "@/shared/config";

const t = dict.carouselToHome;

/** «Окремим рядком» = a new CAROUSEL block; «Вкладкою в блоці» = a tab of a TABS block. */
export type AddToHomeMode = "block" | "tab";

/** The API's cap on tabs per block (`MAX_HOME_BLOCK_TABS`, CreateHomeBlockDto). */
export const MAX_HOME_BLOCK_TABS = 20;

export interface PositionOption {
  /** The `position` the create DTO takes: a 0-based index into the page order. */
  value: number;
  label: string;
}

/**
 * «Куди поставити»: the very top, or right after any block — every block counts,
 * hidden ones too, because `position` indexes the WHOLE page order.
 */
export function positionOptions(
  blocks: readonly HomeBlockEntity[],
): PositionOption[] {
  return [
    { value: 0, label: t.positionFirst },
    ...sortHomeBlocks(blocks).map((block, index) => ({
      value: index + 1,
      label: t.positionAfter(homeBlockLabel(block)),
    })),
  ];
}

/**
 * Where a new rail goes unless the operator says otherwise: right after the last
 * carousel-bearing block (rails sit together, as on the page today), else at the
 * end of the page.
 */
export function defaultPosition(blocks: readonly HomeBlockEntity[]): number {
  const sorted = sortHomeBlocks(blocks);
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const type = sorted[index].type;
    if (type === "CAROUSEL" || type === "TABS") return index + 1;
  }
  return sorted.length;
}

/** The TABS blocks that can take one more tab, in page order. */
export function tabTargets(
  blocks: readonly HomeBlockEntity[],
): HomeBlockEntity[] {
  return sortHomeBlocks(blocks).filter(
    (block) => block.type === "TABS" && block.tabs.length < MAX_HOME_BLOCK_TABS,
  );
}

/**
 * The COMPLETE new tab list for `PUT /admin/home-blocks/:id` — the update
 * replaces the list, so it carries every current tab in order, then the new one
 * last (ДН-4.12: «останньою вкладкою»).
 */
export function tabsAfterAppend(
  block: HomeBlockEntity,
  carouselId: string,
): string[] {
  const current = [...block.tabs]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((tab) => tab.carousel.id)
    .filter((id) => id !== carouselId);
  return [...current, carouselId];
}
