/**
 * Seeded contact-form submissions.
 *
 * `phone` is the canonical `380XXXXXXXXX` form (TASK-466): the seed writes
 * through Prisma and bypasses `CreateContactMessageDto`, which is what
 * normalises a real submission, so a masked literal here would undo the backfill
 * migration on every `db:seed`.
 */
export const messages: {
  key: string;
  name: string;
  phone: string;
  email: string;
  topic: string;
  orderRef?: string;
  message: string;
  status: 'NEW' | 'READ' | 'ARCHIVED';
  adminNote?: string;
}[] = [
  {
    key: 'msg-1',
    name: 'Оксана Шевченко',
    phone: '380671112233',
    email: 'oksana@example.com',
    topic: 'Доставка',
    message: 'Доброго дня! Коли буде відправлено моє замовлення? Дуже чекаю.',
    status: 'NEW',
  },
  {
    key: 'msg-2',
    name: 'Тарас Бондаренко',
    phone: '380672223344',
    email: 'taras@example.com',
    topic: 'Гарантія',
    orderRef: 'taras-1',
    message: 'Чи діє гарантія на зарядний пристрій, який я замовляв минулого тижня?',
    status: 'NEW',
  },
  {
    key: 'msg-3',
    name: 'Марія Коваль',
    phone: '380673334455',
    email: 'mariia@example.com',
    topic: 'Повернення',
    message: 'Хочу повернути товар. Підкажіть, будь ласка, як це зробити?',
    status: 'READ',
    adminNote: 'Надіслано інструкцію з повернення.',
  },
  {
    key: 'msg-4',
    name: 'Дмитро Ткаченко',
    phone: '380674445566',
    email: 'dmytro@example.com',
    topic: 'Наявність товару',
    message: 'Коли знову буде в наявності кабель USB-C 2м? Дякую.',
    status: 'READ',
  },
  {
    key: 'msg-5',
    name: 'Наталія Кравченко',
    phone: '380675556677',
    email: 'nataliia@example.com',
    topic: 'Співпраця',
    message: 'Вітаю! Цікавить оптова закупівля аксесуарів. З ким можна поспілкуватися?',
    status: 'ARCHIVED',
    adminNote: 'Передано менеджеру з оптових продажів.',
  },
];
