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
 */
export const banners = [
  {
    placement: 'HERO_SLIDE' as const,
    slot: 'hero-1',
    title: 'Аксесуари для вашого iPhone',
    subtitle: 'Чохли, захисне скло та зарядки — усе в одному місці',
    imageUrl: '/images/banners/hero-accessories.jpg',
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
    imageUrl: '/images/banners/hero-audio.jpg',
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
    imageUrl: '/images/banners/promo-glass.jpg',
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
    imageUrl: '/images/banners/promo-power.jpg',
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
    imageUrl: '/images/banners/promo-shipping.jpg',
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
    imageUrl: null,
    ctaLabel: 'Детальніше',
    ctaHref: '/promo',
    theme: 'accent',
    sortOrder: 0,
  },
];
