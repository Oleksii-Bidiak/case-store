export const servicesData = [
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
];

/** Services templated on the PARENT «Смартфони» category. */
export const templateServiceNames = [
  'Гарантійний сертифікат (24 міс.)',
  'Страхування від пошкоджень',
  'Налаштування пристрою',
];

/**
 * One delta of each type, on three named iPhone positions.
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
];
