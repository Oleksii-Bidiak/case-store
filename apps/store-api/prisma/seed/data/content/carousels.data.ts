/**
 * Homepage carousels. A factory, not a literal: the CATEGORY rail carries the
 * id of a category that must already exist.
 *
 * `home` says how the carousel is put on the homepage (TASK-660): as a tab of the
 * «Популярне» TABS block, or as its own CAROUSEL block. It is seed-only data — the
 * carousel row itself has no placement since TASK-660; the homepage blocks hold it.
 * `sortOrder` is the position in the ONE admin carousel list.
 *
 * `state` (TASK-2569): absent = PUBLISHED now; `DRAFT`; or SCHEDULED in
 * `scheduledInDays` (relative to the run). A `rail` of a scheduled carousel gets
 * a CAROUSEL block scheduled for the same instant — the storefront shows a
 * block only while both the block and its carousel are published, so the two
 * go live together. `home: 'none'` is not on the homepage at all.
 */
export interface SeedCarousel {
  slug: string;
  title: string;
  source: 'BESTSELLING' | 'NEWEST' | 'ON_SALE' | 'CATEGORY' | 'MANUAL';
  home: 'tab' | 'rail' | 'none';
  categoryId?: string | null;
  itemLimit?: number;
  sortOrder: number;
  state?: 'DRAFT' | { scheduledInDays: number };
}

export function buildCarousels(
  categoryBySlug: Record<string, { id: string } | null>,
): SeedCarousel[] {
  const casesCategory = categoryBySlug['cases'];
  const powerBanks = categoryBySlug['power-banks'];
  const headphones = categoryBySlug['headphones'];
  const carousels: SeedCarousel[] = [
    // ── "Популярне" tabs (TASK-288) ──
    {
      slug: 'bestsellers',
      title: 'Хіти продажів',
      source: 'BESTSELLING',
      home: 'tab',
      itemLimit: 12,
      sortOrder: 0,
    },
    {
      slug: 'newest',
      title: 'Новинки',
      source: 'NEWEST',
      home: 'tab',
      itemLimit: 12,
      sortOrder: 1,
    },
    {
      slug: 'on-sale',
      title: 'Акційні',
      source: 'ON_SALE',
      home: 'tab',
      itemLimit: 12,
      sortOrder: 2,
    },
    // ── Standalone rails ──
    ...(casesCategory
      ? [
          {
            slug: 'cases',
            title: 'Чохли для смартфонів',
            source: 'CATEGORY' as const,
            home: 'rail' as const,
            categoryId: casesCategory.id,
            itemLimit: 12,
            sortOrder: 3,
          },
        ]
      : []),
    {
      slug: 'editors-pick',
      title: 'Редакція обирає',
      source: 'MANUAL',
      home: 'rail',
      sortOrder: 4,
    },
    // ── Not live yet (TASK-2569) ──
    ...(powerBanks
      ? [
          {
            slug: 'road-power',
            title: 'Заряд у дорогу',
            source: 'CATEGORY' as const,
            home: 'rail' as const,
            categoryId: powerBanks.id,
            itemLimit: 8,
            sortOrder: 5,
            state: { scheduledInDays: 7 },
          },
        ]
      : []),
    ...(headphones
      ? [
          {
            slug: 'gift-audio',
            title: 'Подарунки меломанам',
            source: 'CATEGORY' as const,
            home: 'none' as const,
            categoryId: headphones.id,
            itemLimit: 8,
            sortOrder: 6,
            state: 'DRAFT' as const,
          },
        ]
      : []),
  ];

  return carousels;
}
