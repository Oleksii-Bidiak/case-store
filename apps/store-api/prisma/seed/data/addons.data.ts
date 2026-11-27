export const servicesData: Array<{
  name: string;
  description: string;
  price: number;
  /** Written only when set — an admin's switch on a seeded service stays otherwise. */
  isActive?: boolean;
}> = [
  {
    name: 'Гарантійний сертифікат (24 міс.)',
    description: 'Продовжена гарантія на 24 місяці з безкоштовним сервісним обслуговуванням.',
    price: 499,
  },
  {
    name: 'Страхування від пошкоджень',
    description: 'Покриття випадкових пошкоджень екрана та корпусу протягом 12 місяців.',
    price: 899,
  },
  {
    name: 'Налаштування пристрою',
    description: 'Перенесення даних, налаштування акаунтів та встановлення застосунків.',
    price: 299,
  },
  {
    name: 'Trade-in оцінка на місці',
    description: 'Ексклюзивна послуга: оцінка старого пристрою в залік вартості нового.',
    price: 0,
  },
  {
    name: 'Подарункове пакування',
    description: 'Фірмова коробка з листівкою — подарунок одразу готовий до вручення.',
    price: 79,
  },
  // Switched off by the shop (TASK-2569): it still sits in the «Samsung»
  // template, and the resolver drops it, so the panel shows a service the
  // storefront never offers.
  {
    name: 'Експрес-ремонт за 24 години',
    description: 'Ремонт у сервісному центрі партнера за одну добу замість трьох.',
    price: 1499,
    isActive: false,
  },
];

/**
 * Category templates. A category's own template REPLACES its ancestors' outright
 * (nearest ancestor wins, `AddonApplicabilityResolver`), so:
 *   - «iPhone» and «Xiaomi» have none and inherit «Смартфони»;
 *   - «Samsung» declares its own and offers only insurance — the express repair
 *     in it is inactive and drops out (TASK-2569);
 *   - «Навушники» is a second, separate tree.
 */
export const categoryTemplates: Array<{ categorySlug: string; serviceNames: string[] }> = [
  {
    categorySlug: 'smartphones',
    serviceNames: [
      'Гарантійний сертифікат (24 міс.)',
      'Страхування від пошкоджень',
      'Налаштування пристрою',
    ],
  },
  {
    categorySlug: 'samsung-phones',
    serviceNames: ['Страхування від пошкоджень', 'Експрес-ремонт за 24 години'],
  },
  {
    categorySlug: 'headphones',
    serviceNames: ['Гарантійний сертифікат (24 міс.)', 'Подарункове пакування'],
  },
];

/**
 * One delta of each type on three named iPhone positions, plus an ADD with its
 * own price on a watch (TASK-2569).
 *
 * `positionSlug` is explicit for a reason. The previous revision picked its
 * targets with `findMany({ where: { category: { slug: 'iphone' } }, orderBy:
 * { createdAt: 'asc' }, take: 3 })`, which was already fragile and stopped being
 * deterministic outright once TASK-366 inserted 178 positions inside one loop:
 * they share a `createdAt` to the millisecond, so «the first three» became
 * whatever order Postgres felt like returning. The deltas then wandered between
 * products from one seed to the next — and a QA step that says «open the iPhone
 * with the OVERRIDE» cannot be written against a moving target.
 *
 * Three different entries rather than three positions of one, so the admin
 * screen shows the deltas on visibly different products.
 */
export const deltas: Array<{
  type: 'ADD' | 'REMOVE' | 'OVERRIDE';
  serviceName: string;
  positionSlug: string;
  price?: number;
}> = [
  {
    type: 'ADD',
    serviceName: 'Trade-in оцінка на місці',
    positionSlug: 'apple-iphone-16-pro-128gb-black',
  },
  {
    type: 'REMOVE',
    serviceName: 'Налаштування пристрою',
    positionSlug: 'apple-iphone-15-pro-128gb-titanium',
  },
  {
    type: 'OVERRIDE',
    serviceName: 'Страхування від пошкоджень',
    positionSlug: 'apple-iphone-14-128gb',
    price: 1299,
  },
  // An exclusive add-on at its own price: smartwatches have no template at all.
  {
    type: 'ADD',
    serviceName: 'Подарункове пакування',
    positionSlug: 'watch-apple-series-10-42-black',
    price: 49,
  },
];

/**
 * What the resolver must answer for a few positions once the rows are written —
 * the seeder checks it, so a template or delta that stops meaning what the
 * comments above say fails the seed instead of shipping a silent demo gap.
 */
export const expectedAddons: Array<{ positionSlug: string; addons: Record<string, number> }> = [
  { positionSlug: 'samsung-galaxy-s24-128gb-black', addons: { 'Страхування від пошкоджень': 899 } },
  {
    positionSlug: 'xiaomi-14',
    addons: {
      'Гарантійний сертифікат (24 міс.)': 499,
      'Налаштування пристрою': 299,
      'Страхування від пошкоджень': 899,
    },
  },
  { positionSlug: 'watch-apple-series-10-42-black', addons: { 'Подарункове пакування': 49 } },
];
