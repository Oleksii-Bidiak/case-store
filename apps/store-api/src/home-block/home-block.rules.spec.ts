import { HomeBlockType, PublishStatus } from '@prisma/client';
import { isSystemHomeBlockType, visibleHomeBlocks } from './home-block.rules';

const carousel = (id: string, status: PublishStatus) => ({ id, status });
const block = (
  type: HomeBlockType,
  extra: Partial<{
    status: PublishStatus;
    carousel: { id: string; status: PublishStatus } | null;
    tabs: { carousel: { id: string; status: PublishStatus } }[];
  }> = {},
) => ({
  type,
  status: PublishStatus.PUBLISHED,
  carousel: null,
  tabs: [],
  ...extra,
});

describe('visibleHomeBlocks (TASK-660/661)', () => {
  it('drops unpublished blocks on a public read', () => {
    const result = visibleHomeBlocks(
      [
        block(HomeBlockType.HERO),
        block(HomeBlockType.TRUST, { status: PublishStatus.DRAFT }),
        block(HomeBlockType.NEWSLETTER, { status: PublishStatus.SCHEDULED }),
      ],
      false,
    );
    expect(result.map((b) => b.type)).toEqual([HomeBlockType.HERO]);
  });

  it('hides a CAROUSEL block whose carousel is missing or not published', () => {
    const result = visibleHomeBlocks(
      [
        block(HomeBlockType.CAROUSEL, { carousel: carousel('a', PublishStatus.PUBLISHED) }),
        block(HomeBlockType.CAROUSEL, { carousel: carousel('b', PublishStatus.DRAFT) }),
        block(HomeBlockType.CAROUSEL, { carousel: carousel('c', PublishStatus.SCHEDULED) }),
        block(HomeBlockType.CAROUSEL, { carousel: null }),
      ],
      false,
    );
    expect(result.map((b) => b.carousel?.id)).toEqual(['a']);
  });

  it('keeps only published tabs, and keeps a TABS block with none (storefront fallback)', () => {
    const result = visibleHomeBlocks(
      [
        block(HomeBlockType.TABS, {
          tabs: [
            { carousel: carousel('x', PublishStatus.DRAFT) },
            { carousel: carousel('y', PublishStatus.PUBLISHED) },
          ],
        }),
        block(HomeBlockType.TABS, { tabs: [{ carousel: carousel('z', PublishStatus.DRAFT) }] }),
      ],
      false,
    );
    expect(result).toHaveLength(2);
    expect(result[0].tabs.map((t) => t.carousel.id)).toEqual(['y']);
    expect(result[1].tabs).toEqual([]);
  });

  it('shows drafts and scheduled blocks, carousels and tabs in a preview — but not orphans', () => {
    const result = visibleHomeBlocks(
      [
        block(HomeBlockType.HERO, { status: PublishStatus.DRAFT }),
        block(HomeBlockType.CAROUSEL, {
          status: PublishStatus.SCHEDULED,
          carousel: carousel('b', PublishStatus.DRAFT),
        }),
        block(HomeBlockType.CAROUSEL, { carousel: null }),
        block(HomeBlockType.TABS, { tabs: [{ carousel: carousel('z', PublishStatus.DRAFT) }] }),
      ],
      true,
    );
    expect(result.map((b) => b.type)).toEqual([
      HomeBlockType.HERO,
      HomeBlockType.CAROUSEL,
      HomeBlockType.TABS,
    ]);
    expect(result[2].tabs).toHaveLength(1);
  });
});

describe('isSystemHomeBlockType', () => {
  it('marks the six singletons and leaves CAROUSEL / TABS deletable', () => {
    const system = Object.values(HomeBlockType).filter(isSystemHomeBlockType);
    expect(system.sort()).toEqual(
      ['CATEGORY_NAV', 'HERO', 'NEWSLETTER', 'PROMO_BANNER', 'RECENTLY_VIEWED', 'TRUST'].sort(),
    );
  });
});
