/**
 * Homepage carousels. A factory, not a literal: the CATEGORY rail carries the
 * id of a category that must already exist.
 *
 * `home` says how the carousel is put on the homepage (TASK-660): as a tab of the
 * «Популярне» TABS block, or as its own CAROUSEL block. It is seed-only data — the
 * carousel row itself has no placement since TASK-660; the homepage blocks hold it.
 * `sortOrder` is the position in the ONE admin carousel list.
 */
export function buildCarousels(casesCategory: { id: string } | null) {
  const carousels: {
    slug: string;
    title: string;
    source: 'BESTSELLING' | 'NEWEST' | 'ON_SALE' | 'CATEGORY' | 'MANUAL';
    home: 'tab' | 'rail';
    categoryId?: string | null;
    itemLimit?: number;
    sortOrder: number;
  }[] = [
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
  ];

  return carousels;
}
