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

/** One delta of each type, applied to three distinct iPhone products. */
export const deltas: Array<{
  type: 'ADD' | 'REMOVE' | 'OVERRIDE';
  serviceName: string;
  price?: number;
}> = [
  { type: 'ADD', serviceName: 'Trade-in оцінка на місці' },
  { type: 'REMOVE', serviceName: 'Налаштування пристрою' },
  { type: 'OVERRIDE', serviceName: 'Страхування від пошкоджень', price: 1299 },
];
