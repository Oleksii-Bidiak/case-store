import { HomeBlockType, PublishStatus } from '@prisma/client';

/**
 * Pure rules of the homepage registry (TASK-660 / TASK-661, plan 186). No I/O here, so
 * the visibility rule the storefront depends on is unit-testable on its own and the
 * migration's integration gate exercises exactly the code the endpoint runs.
 */

/**
 * The singleton blocks (decision B-9 №2): one row each, created by the `…_home_blocks`
 * migration. They can be hidden, scheduled and moved — never created or deleted
 * through the API, because their content lives elsewhere (banners, settings, code) and
 * a page without its slider is a bug, not a choice.
 */
export const SYSTEM_HOME_BLOCK_TYPES: ReadonlySet<HomeBlockType> = new Set<HomeBlockType>([
  HomeBlockType.HERO,
  HomeBlockType.TRUST,
  HomeBlockType.CATEGORY_NAV,
  HomeBlockType.PROMO_BANNER,
  HomeBlockType.RECENTLY_VIEWED,
  HomeBlockType.NEWSLETTER,
]);

/** The two types the admin may create (and delete). */
export const CREATABLE_HOME_BLOCK_TYPES = [HomeBlockType.CAROUSEL, HomeBlockType.TABS] as const;
export type CreatableHomeBlockType = (typeof CREATABLE_HOME_BLOCK_TYPES)[number];

export function isSystemHomeBlockType(type: HomeBlockType): boolean {
  return SYSTEM_HOME_BLOCK_TYPES.has(type);
}

/** The minimal carousel shape the visibility rule reads. */
export interface VisibilityCarousel {
  id: string;
  status: PublishStatus;
}

/** The minimal block shape the visibility rule reads. */
export interface VisibilityBlock<C extends VisibilityCarousel> {
  type: HomeBlockType;
  status: PublishStatus;
  carousel: C | null;
  tabs: { carousel: C }[];
}

/**
 * What the storefront may see of the homepage.
 *
 * PUBLIC (`preview = false`):
 *   - only PUBLISHED blocks (the repository already filters; repeated here so the rule
 *     is whole in one place);
 *   - a CAROUSEL block whose carousel is missing (deleted → SetNull) or not PUBLISHED
 *     is hidden — the migration backfilled a block for every carousel of every status,
 *     and this is what keeps the visible page identical to the old one;
 *   - a TABS block keeps only its PUBLISHED tabs and is returned EVEN WITH NONE: the
 *     storefront then shows its query-driven fallback tabs, exactly as the old
 *     «Популярне» did with no HOME_TABS carousel.
 *
 * PREVIEW (`preview = true`, a valid signed `home` token — TASK-668): every block of
 * every status and every tab, drafts included, so the owner sees the page as it WILL
 * be. An orphaned CAROUSEL block (no carousel at all) is still dropped — there is
 * nothing to draw.
 */
export function visibleHomeBlocks<C extends VisibilityCarousel, B extends VisibilityBlock<C>>(
  blocks: readonly B[],
  preview: boolean,
): B[] {
  const live = (status: PublishStatus) => preview || status === PublishStatus.PUBLISHED;

  const result: B[] = [];
  for (const block of blocks) {
    if (!live(block.status)) continue;
    if (block.type === HomeBlockType.CAROUSEL) {
      if (!block.carousel || !live(block.carousel.status)) continue;
      result.push(block);
      continue;
    }
    if (block.type === HomeBlockType.TABS) {
      result.push({ ...block, tabs: block.tabs.filter((tab) => live(tab.carousel.status)) });
      continue;
    }
    result.push(block);
  }
  return result;
}
