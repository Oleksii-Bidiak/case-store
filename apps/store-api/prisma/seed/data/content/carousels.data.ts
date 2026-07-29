/**
 * Homepage carousels. A factory, not a literal: the CATEGORY rail carries the
 * id of a category that must already exist.
 */
export function buildCarousels(casesCategory: { id: string } | null) {
  const carousels: {
    slug: string;
    title: string;
    source: 'BESTSELLING' | 'NEWEST' | 'ON_SALE' | 'CATEGORY' | 'MANUAL';
    placement: 'HOME_TABS' | 'HOME_RAILS';
    categoryId?: string | null;
    itemLimit?: number;
    sortOrder: number;
  }[] = [
    // ── "Популярне" tabs (TASK-288) ──
    {
      slug: 'bestsellers',
      title: 'Хіти продажів',
      source: 'BESTSELLING',
      placement: 'HOME_TABS',
      itemLimit: 12,
      sortOrder: 0,
    },
    {
      slug: 'newest',
      title: 'Новинки',
      source: 'NEWEST',
      placement: 'HOME_TABS',
      itemLimit: 12,
      sortOrder: 1,
    },
    {
      slug: 'on-sale',
      title: 'Акційні',
      source: 'ON_SALE',
      placement: 'HOME_TABS',
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
            placement: 'HOME_RAILS' as const,
            categoryId: casesCategory.id,
            itemLimit: 12,
            sortOrder: 0,
          },
        ]
      : []),
    {
      slug: 'editors-pick',
      title: 'Редакція обирає',
      source: 'MANUAL',
      placement: 'HOME_RAILS',
      sortOrder: 1,
    },
  ];

  return carousels;
}
