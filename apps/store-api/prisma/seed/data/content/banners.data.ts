import type { IconId, PaletteId } from '../../lib/images/seed-image.generator';

/**
 * Home-page banner content (TASK-256).
 *
 * **Every `ctaHref` must be a route the storefront actually has.** All six used
 * to point at `/catalog` and `/catalog?category=…`, which has never existed — the
 * storefront serves `/products` and `/categories/[slug]` — so the demo's most
 * prominent calls to action all led to a 404. Filter params are no substitute
 * either: `/products` accepts `categoryId` (an id, not a slug), which static seed
 * content cannot know, and its server query does not forward `onSale` at all.
 * Hence `/categories/<root slug>` for a category and `/promo` for the deals
 * landing page, which does read real on-sale products.
 *
 * The copy has to be true as well. The old shipping banner promised «безкоштовна
 * доставка від 1000 грн» and nothing in the system implements a free-shipping
 * threshold — delivery is priced by the Nova Poshta integration at checkout. A
 * demo that advertises a rule the checkout then ignores is worse than one that
 * advertises nothing.
 *
 * Pictures come from the seed generator's wide shape (TASK-2569). They used to
 * be `/images/banners/*.jpg` — files that never existed anywhere, and a relative
 * path the storefront's image allowlist does not accept either, so every
 * seeded banner rendered without art.
 */
export interface SeedBanner {
  placement: 'HERO_SLIDE' | 'PROMO_TILE' | 'PROMO_BANNER' | 'ANNOUNCEMENT_BAR';
  slot: string;
  title: string;
  subtitle: string | null;
  image: { iconId: IconId; paletteId: PaletteId; alt: string } | null;
  ctaLabel: string;
  ctaHref: string;
  theme: string;
  sortOrder: number;
  /**
   * Absent = PUBLISHED now. `DRAFT`, or SCHEDULED for `now + scheduledInDays`
   * with the window ending at `now + untilInDays` — relative to the run, so a
   * re-seed always shows the same «in a week».
   */
  state?: 'DRAFT' | { scheduledInDays: number; untilInDays: number };
}

export const banners: SeedBanner[] = [
  {
    placement: 'HERO_SLIDE' as const,
    slot: 'hero-1',
    title: 'Аксесуари для вашого iPhone',
    subtitle: 'Чохли, захисне скло та зарядки — усе в одному місці',
    image: {
      iconId: 'case',
      paletteId: 'indigo',
      alt: 'Чохол для смартфона на синьо-фіолетовому тлі',
    },
    ctaLabel: 'До каталогу',
    ctaHref: '/products',
    theme: 'accent',
    sortOrder: 0,
  },
  {
    placement: 'HERO_SLIDE' as const,
    slot: 'hero-2',
    title: 'Нова колекція навушників',
    subtitle: 'Занурся у звук без компромісів',
    image: { iconId: 'headphones', paletteId: 'violet', alt: 'Навушники на фіолетовому тлі' },
    ctaLabel: 'Обрати',
    ctaHref: '/categories/headphones',
    theme: 'default',
    sortOrder: 1,
  },
  {
    placement: 'PROMO_TILE' as const,
    slot: 'promo-tile-1',
    title: 'Захисне скло та плівки',
    subtitle: 'Комплекти на дві та три штуки — вигідніше',
    image: { iconId: 'shield', paletteId: 'teal', alt: 'Захисне скло — щит на бірюзовому тлі' },
    ctaLabel: 'Купити',
    ctaHref: '/categories/screen-protectors',
    theme: 'accent',
    sortOrder: 0,
  },
  {
    placement: 'PROMO_TILE' as const,
    slot: 'promo-tile-2',
    title: 'Павербанки',
    subtitle: 'Заряд на весь день — від кишенькових до 26 800 мА·год',
    image: { iconId: 'powerbank', paletteId: 'amber', alt: 'Павербанк на бурштиновому тлі' },
    ctaLabel: 'Дивитись',
    ctaHref: '/categories/power-banks',
    theme: 'default',
    sortOrder: 1,
  },
  {
    placement: 'PROMO_BANNER' as const,
    slot: 'promo-banner-1',
    title: 'Доставка Новою поштою по всій Україні',
    subtitle: 'Вартість розраховуємо на кроці оформлення — без сюрпризів',
    image: { iconId: 'package', paletteId: 'blue', alt: 'Посилка на синьому тлі' },
    ctaLabel: 'Замовити',
    ctaHref: '/products',
    theme: 'accent',
    sortOrder: 0,
  },
  {
    placement: 'ANNOUNCEMENT_BAR' as const,
    slot: 'announcement-1',
    title: 'Акційні ціни на добірку товарів — дивіться розділ «Акції»',
    subtitle: null,
    image: null,
    ctaLabel: 'Детальніше',
    ctaHref: '/promo',
    theme: 'accent',
    sortOrder: 0,
  },
  // ── Not live yet (TASK-2569) ──
  // Goes live in a week on its own and comes down two weeks later (the
  // PublishingScheduler does both). Counts toward the five-tile limit already.
  {
    placement: 'PROMO_TILE' as const,
    slot: 'promo-tile-3',
    title: 'Ремінці для Apple Watch',
    subtitle: 'Силікон і нейлон під корпуси 42, 46 і 49 мм',
    image: { iconId: 'band', paletteId: 'rose', alt: 'Ремінець для годинника на рожевому тлі' },
    ctaLabel: 'Підібрати',
    ctaHref: '/categories/smartwatches',
    theme: 'default',
    sortOrder: 2,
    state: { scheduledInDays: 7, untilInDays: 21 },
  },
  // A draft the content manager is still working on: in the panel, nowhere else.
  {
    placement: 'HERO_SLIDE' as const,
    slot: 'hero-3',
    title: 'Колонки для дому й дороги',
    subtitle: 'Від кишенькових до вечірніх — з підсвіткою та захистом від води',
    image: { iconId: 'speaker', paletteId: 'emerald', alt: 'Колонка на смарагдовому тлі' },
    ctaLabel: 'Слухати',
    ctaHref: '/categories/speakers',
    theme: 'default',
    sortOrder: 2,
    state: 'DRAFT',
  },
];
