import type { OrderSpec, OrderStatus } from '../types';

/**
 * The seeded orders (TASK-2569 / TASK-2563 / TASK-1821).
 *
 * Every order is one the shop could actually have produced: a delivery method
 * the checkout offers with what it needs (an NP city ref and branch, an active
 * pickup point, a street), a payment method inside the delivery × payment
 * matrix, and money that arrived the way the money ledger records it. The
 * payment status is never asserted on its own — `lib/order-plan.ts` derives it
 * from `money` with the domain's rules, and the seed refuses a spec whose
 * stated `paymentStatus` disagrees.
 *
 * Dates are relative to the moment of seeding (`daysAgo`, hour offsets), and
 * rewritten on every run.
 */
export const orderSpecs: OrderSpec[] = [
  {
    key: 'john-1',
    email: 'customer@store.com',
    status: 'PENDING',
    paymentStatus: 'PENDING',
    statusFlow: ['PENDING'],
    paymentMethod: 'ON_DELIVERY',
    delivery: { method: 'NOVA_POSHTA', city: 'kyiv', branch: 0 },
    items: [{ sku: 'IP14-128', quantity: 1, addons: ['Страхування від пошкоджень'] }],
    notes: 'Оплата при отриманні у відділенні.',
    // Older than 48 h on purpose: the dashboard's «Очікують понад 48 год».
    daysAgo: 3,
  },
  {
    key: 'oksana-1',
    email: 'oksana@example.com',
    status: 'CONFIRMED',
    paymentStatus: 'PAID',
    statusFlow: ['PENDING', 'CONFIRMED'],
    statusAt: { CONFIRMED: 0.2 },
    systemStatuses: ['CONFIRMED'],
    paymentMethod: 'ONLINE',
    delivery: { method: 'PICKUP', point: 'kyiv-khreshchatyk' },
    items: [
      { sku: 'CASE-SIL-MAG-IP15-BK', quantity: 2 },
      { sku: 'SP-GL-IP15-1', quantity: 1 },
    ],
    daysAgo: 2,
    money: [{ type: 'liqpay', outcome: 'SUCCEEDED', at: 0.2 }],
  },
  {
    key: 'taras-1',
    email: 'taras@example.com',
    byOperator: true,
    status: 'PROCESSING',
    paymentStatus: 'PARTIALLY_PAID',
    statusFlow: ['PENDING', 'CONFIRMED', 'PROCESSING'],
    paymentMethod: 'BANK_TRANSFER',
    delivery: { method: 'COURIER', street: 'вул. Січових Стрільців, 14, кв. 8' },
    items: [
      { sku: 'CHG-ANK-20W-WH', quantity: 1 },
      { sku: 'CAB-UGR-CC100-1M', quantity: 2 },
    ],
    notes: 'Прохання зателефонувати перед доставкою.',
    internalNotes: 'Замовлення по телефону. Передоплата 1000 грн на рахунок ФОП, решта — курʼєру.',
    daysAgo: 3,
    money: [{ type: 'receipt', kind: 'BANK_TRANSFER', amount: 1000, at: 3 }],
  },
  {
    key: 'mariia-1',
    email: 'mariia@example.com',
    status: 'SHIPPED',
    paymentStatus: 'PAID',
    statusFlow: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'],
    statusAt: { CONFIRMED: 0.2 },
    systemStatuses: ['CONFIRMED'],
    paymentMethod: 'ONLINE',
    delivery: { method: 'NOVA_POSHTA', city: 'lviv', branch: 0 },
    items: [{ sku: 'IP15PRO-128-NT', quantity: 1, addons: ['Гарантійний сертифікат (24 міс.)'] }],
    discountCode: 'WELCOME10',
    trackingNumber: '20451234567801',
    daysAgo: 4,
    money: [{ type: 'liqpay', outcome: 'SUCCEEDED', at: 0.2 }],
  },
  {
    key: 'dmytro-1',
    email: 'dmytro@example.com',
    status: 'DELIVERED',
    paymentStatus: 'PAID',
    statusFlow: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'],
    paymentMethod: 'ON_DELIVERY',
    delivery: { method: 'NOVA_POSHTA', city: 'odesa', branch: 0 },
    items: [
      { sku: 'IP15PRO-256-BT', quantity: 1, addons: ['Гарантійний сертифікат (24 міс.)'] },
      { sku: 'CHG-BLK-MAG15-BK', quantity: 1 },
    ],
    discountCode: 'SUMMER500',
    trackingNumber: '20451234567802',
    daysAgo: 12,
    money: [{ type: 'receipt', kind: 'COD_NOVA_POSHTA', at: 72 }],
  },
  {
    key: 'nataliia-1',
    email: 'nataliia@example.com',
    status: 'DELIVERED',
    paymentStatus: 'PAID',
    statusFlow: ['PENDING', 'CONFIRMED', 'PROCESSING', 'DELIVERED'],
    paymentMethod: 'ON_DELIVERY',
    delivery: { method: 'PICKUP', point: 'lviv-rynok' },
    items: [
      { sku: 'CASE-SIL-MAG-IP15-BK', quantity: 1 },
      { sku: 'CHG-BSU-CAR30-BK', quantity: 1 },
    ],
    daysAgo: 14,
    // An overpayment: legal, never silent — it carries its reason and the
    // order shows «Винні покупцю».
    money: [
      {
        type: 'receipt',
        kind: 'PAID_AT_POINT',
        amount: 1800,
        at: 72,
        reason: 'Покупниця не взяла решту — зарахуємо в наступне замовлення',
      },
    ],
  },
  {
    key: 'oksana-2',
    email: 'oksana@example.com',
    status: 'CANCELLED',
    paymentStatus: 'FAILED',
    statusFlow: ['PENDING', 'CANCELLED'],
    // The 30-minute card reservation ran out after the bank declined: the
    // reconcile worker cancelled it, not a person.
    statusAt: { CANCELLED: 0.6 },
    systemStatuses: ['CANCELLED'],
    paymentMethod: 'ONLINE',
    delivery: { method: 'NOVA_POSHTA', city: 'lviv', branch: 1 },
    items: [{ sku: 'IP13-128', quantity: 1 }],
    internalNotes: 'Оплату відхилено банком, резерв знято автоматично.',
    daysAgo: 6,
    money: [{ type: 'liqpay', outcome: 'FAILED', at: 0.1 }],
  },
  {
    key: 'taras-2',
    email: 'taras@example.com',
    status: 'CANCELLED',
    paymentStatus: 'PENDING',
    statusFlow: ['PENDING', 'CANCELLED'],
    statusAt: { CANCELLED: 2 },
    paymentMethod: 'ON_DELIVERY',
    delivery: { method: 'NOVA_POSHTA', city: 'odesa', branch: 1 },
    items: [{ sku: 'CAB-RMX-MU-1M', quantity: 3 }],
    daysAgo: 5,
    selfCancel: true,
  },
  {
    key: 'mariia-2',
    email: 'mariia@example.com',
    status: 'DELIVERED',
    paymentStatus: 'PAID',
    statusFlow: ['PENDING', 'CONFIRMED', 'PROCESSING', 'DELIVERED'],
    statusAt: { CONFIRMED: 0.2 },
    systemStatuses: ['CONFIRMED'],
    paymentMethod: 'ONLINE',
    // Pickup: no shipping to keep, so once both lines come back the whole
    // payment goes back too (REFUNDED, not PARTIALLY_REFUNDED).
    delivery: { method: 'PICKUP', point: 'kyiv-khreshchatyk' },
    items: [
      { sku: 'IP14-128', quantity: 1 },
      { sku: 'CHG-ANK-20W-WH', quantity: 1 },
    ],
    daysAgo: 40,
    money: [{ type: 'liqpay', outcome: 'SUCCEEDED', at: 0.2 }],
    refundedByReturns: true,
  },
  {
    key: 'dmytro-2',
    email: 'dmytro@example.com',
    status: 'PROCESSING',
    paymentStatus: 'PENDING',
    statusFlow: ['PENDING', 'CONFIRMED', 'PROCESSING'],
    paymentMethod: 'ON_DELIVERY',
    delivery: { method: 'COURIER', street: 'просп. Берестейський, 37, кв. 112' },
    items: [{ sku: 'CHG-BSU-65W-BK', quantity: 1 }],
    notes: 'Оплачу курʼєру готівкою.',
    daysAgo: 2,
  },
  {
    key: 'nataliia-2',
    email: 'nataliia@example.com',
    status: 'SHIPPED',
    paymentStatus: 'PAID',
    statusFlow: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'],
    statusAt: { CONFIRMED: 0.2 },
    systemStatuses: ['CONFIRMED'],
    paymentMethod: 'ONLINE',
    delivery: { method: 'NOVA_POSHTA', city: 'kyiv', branch: 1 },
    items: [
      { sku: 'SP-GL-SGS24', quantity: 2 },
      { sku: 'CASE-SPG-UH-SGS24-BK', quantity: 1 },
    ],
    trackingNumber: '20451234567803',
    daysAgo: 4,
    money: [{ type: 'liqpay', outcome: 'SUCCEEDED', at: 0.2 }],
  },
  {
    key: 'john-2',
    email: 'customer@store.com',
    status: 'DELIVERED',
    paymentStatus: 'PAID',
    statusFlow: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'],
    paymentMethod: 'ON_DELIVERY',
    delivery: { method: 'NOVA_POSHTA', city: 'kyiv', branch: 0 },
    items: [{ sku: 'CHG-BLK-MAG15-WH', quantity: 1 }],
    trackingNumber: '20451234567804',
    daysAgo: 45,
    money: [{ type: 'receipt', kind: 'COD_NOVA_POSHTA', at: 72 }],
  },
  {
    key: 'guest-1',
    guest: {
      firstName: 'Василь',
      lastName: 'Гуменюк',
      email: 'vasyl.humeniuk@example.com',
      phone: '380501112233',
    },
    status: 'CONFIRMED',
    paymentStatus: 'PENDING',
    statusFlow: ['PENDING', 'CONFIRMED'],
    paymentMethod: 'ON_DELIVERY',
    // «Інша доставка»: the operator still has to quote the shipping.
    delivery: { method: 'OTHER', city: 'Рахів', street: 'вул. Миру, 3 (Укрпошта, індекс 90600)' },
    items: [{ sku: 'HP-XIA-RB5-BK', quantity: 1 }],
    notes: 'Доставка Укрпоштою, будь ласка.',
    daysAgo: 1,
  },
  {
    key: 'guest-2',
    guest: {
      firstName: 'Олена',
      lastName: 'Мороз',
      email: 'olena.moroz@example.com',
      phone: '380632223344',
    },
    status: 'DELIVERED',
    paymentStatus: 'PAID',
    statusFlow: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'],
    paymentMethod: 'ON_DELIVERY',
    delivery: { method: 'NOVA_POSHTA', city: 'odesa', branch: 1 },
    items: [{ sku: 'HP-XIA-RB5-WH', quantity: 1 }],
    trackingNumber: '20451234567805',
    daysAgo: 9,
    money: [{ type: 'receipt', kind: 'COD_NOVA_POSHTA', at: 72 }],
  },
  {
    key: 'oksana-3',
    email: 'oksana@example.com',
    status: 'DELIVERED',
    paymentStatus: 'PAID',
    statusFlow: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'],
    statusAt: { SHIPPED: 26, DELIVERED: 30 },
    paymentMethod: 'ON_DELIVERY',
    // From 3000 грн the courier rides free.
    delivery: { method: 'COURIER', street: 'вул. Велика Васильківська, 100, кв. 5' },
    items: [{ sku: 'HP-APL-AP4', quantity: 1 }],
    daysAgo: 34,
    // A mistyped receipt, reversed (сторно) with a reason, then the right one.
    money: [
      { type: 'receipt', kind: 'PAID_TO_COURIER', amount: 6000, at: 30 },
      {
        type: 'reversal',
        of: 0,
        at: 31,
        reason: 'Помилка в сумі: курʼєр передав 6999 грн',
      },
      { type: 'receipt', kind: 'PAID_TO_COURIER', at: 31 },
    ],
  },
  {
    key: 'taras-3',
    email: 'taras@example.com',
    byOperator: true,
    status: 'CANCELLED',
    paymentStatus: 'REFUNDED',
    statusFlow: ['PENDING', 'CONFIRMED', 'CANCELLED'],
    statusAt: { CONFIRMED: 2.5, CANCELLED: 30 },
    paymentMethod: 'BANK_TRANSFER',
    delivery: { method: 'NOVA_POSHTA', city: 'kyiv', branch: 1 },
    items: [{ sku: 'WCH-SAM-W7-BK', quantity: 1 }],
    internalNotes: 'Покупець передумав після оплати; кошти повернено переказом.',
    daysAgo: 8,
    money: [
      { type: 'receipt', kind: 'BANK_TRANSFER', at: 2 },
      {
        type: 'payout',
        kind: 'TRANSFER_REFUND',
        at: 50,
        reason: 'Покупець відмовився від замовлення — повернення на картку',
      },
    ],
  },
  {
    key: 'dmytro-3',
    email: 'dmytro@example.com',
    status: 'PROCESSING',
    paymentStatus: 'PAID',
    statusFlow: ['PENDING', 'CONFIRMED', 'PROCESSING'],
    statusAt: { CONFIRMED: 0.2, PROCESSING: 5 },
    systemStatuses: ['CONFIRMED'],
    paymentMethod: 'INSTALLMENTS',
    delivery: { method: 'PICKUP', point: 'kyiv-khreshchatyk' },
    items: [{ sku: 'HP-SNY-XM5-BK', quantity: 1 }],
    daysAgo: 1,
    money: [{ type: 'liqpay', outcome: 'SUCCEEDED', at: 0.2 }],
  },
  {
    key: 'taras-4',
    email: 'taras@example.com',
    status: 'DELIVERED',
    paymentStatus: 'PAID',
    statusFlow: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'],
    paymentMethod: 'ON_DELIVERY',
    delivery: { method: 'NOVA_POSHTA', city: 'kyiv', branch: 0 },
    items: [
      { sku: 'HP-JBL-720BT-BK', quantity: 1 },
      { sku: 'CAB-UGR-CC100-1M', quantity: 1 },
    ],
    trackingNumber: '20451234567806',
    daysAgo: 20,
    money: [{ type: 'receipt', kind: 'COD_NOVA_POSHTA', at: 72 }],
  },
];

/**
 * Hours after placement at which each status is reached, unless a spec says
 * otherwise (`statusAt`). CANCELLED has no natural place in the line and is
 * usually given per spec.
 */
export const statusOffsetHours: Record<OrderStatus, number> = {
  PENDING: 0,
  CONFIRMED: 0.5,
  PROCESSING: 20,
  SHIPPED: 26,
  DELIVERED: 72,
  CANCELLED: 10,
  REFUNDED: 200,
};
