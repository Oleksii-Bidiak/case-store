import type { OrderSpec } from '../types';

/**
 * «Створити копію» (TASK-2048) as the seed shows it: an original and the copy
 * an operator made of it. `lib/order-copy-plan.ts` adds what
 * `OrderRepository.createManualCopy` writes on top — the cancel with its
 * COPIED_TO_ORDER note (or a `current → current` row carrying it), the copy's
 * COPY_OF_ORDER creation row and, off a cancelled original, the «Залік» pair.
 * The copy is always the owner's work and always for the same customer.
 */
export interface CopyPairSpec {
  original: OrderSpec;
  copy: OrderSpec;
  /** «Скасувати оригінал» was ticked. */
  cancelOriginal: boolean;
  /** Hours after the original was placed at which the copy was made. */
  at: number;
}

export const copyPairs: CopyPairSpec[] = [
  {
    // Paid online, then the buyer wanted another colour: the original is
    // cancelled and its money moves to the copy, which costs more — the rest
    // is paid at the point.
    cancelOriginal: true,
    at: 4,
    original: {
      key: 'oksana-4',
      email: 'oksana@example.com',
      status: 'CANCELLED',
      paymentStatus: 'REFUNDED',
      statusFlow: ['PENDING', 'CONFIRMED', 'CANCELLED'],
      statusAt: { CONFIRMED: 0.2, CANCELLED: 4 },
      systemStatuses: ['CONFIRMED'],
      paymentMethod: 'ONLINE',
      delivery: { method: 'PICKUP', point: 'kyiv-khreshchatyk' },
      items: [{ sku: 'CASE-SIL-MAG-IP15-BK', quantity: 1 }],
      internalNotes: 'Покупниця попросила білий чохол і скло — створено копію, оплату зараховано.',
      daysAgo: 3,
      money: [{ type: 'liqpay', outcome: 'SUCCEEDED', at: 0.2 }],
    },
    copy: {
      key: 'oksana-4-copy',
      email: 'oksana@example.com',
      byOperator: true,
      copiedFrom: 'oksana-4',
      status: 'CONFIRMED',
      paymentStatus: 'PARTIALLY_PAID',
      statusFlow: ['PENDING', 'CONFIRMED'],
      statusAt: { CONFIRMED: 0.1 },
      statusActors: { CONFIRMED: 'owner' },
      paymentMethod: 'ON_DELIVERY',
      delivery: { method: 'PICKUP', point: 'kyiv-khreshchatyk' },
      items: [
        { sku: 'CASE-SIL-MAG-IP15-WH', quantity: 1 },
        { sku: 'SP-GL-IP15-1', quantity: 1 },
      ],
      internalNotes:
        'Копія з іншим кольором. 1299 грн зараховано з оригіналу, решта — при отриманні.',
      daysAgo: 3 - 4 / 24,
    },
  },
  {
    // A repeat purchase of a delivered order: nothing is cancelled and no
    // money moves; the original's timeline still says a copy was made.
    cancelOriginal: false,
    at: 23 * 24,
    original: {
      key: 'nataliia-3',
      email: 'nataliia@example.com',
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      statusFlow: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'],
      paymentMethod: 'ON_DELIVERY',
      delivery: { method: 'NOVA_POSHTA', city: 'kyiv', branch: 1 },
      items: [{ sku: 'CHG-BSU-CAR30-BK', quantity: 2 }],
      trackingNumber: '20451234567807',
      daysAgo: 25,
      money: [{ type: 'receipt', kind: 'COD_NOVA_POSHTA', at: 72 }],
    },
    copy: {
      key: 'nataliia-3-copy',
      email: 'nataliia@example.com',
      byOperator: true,
      copiedFrom: 'nataliia-3',
      status: 'PENDING',
      paymentStatus: 'PENDING',
      statusFlow: ['PENDING'],
      paymentMethod: 'ON_DELIVERY',
      delivery: { method: 'NOVA_POSHTA', city: 'kyiv', branch: 1 },
      items: [{ sku: 'CHG-BSU-CAR30-BK', quantity: 2 }],
      notes: 'Повторіть, будь ласка, попереднє замовлення.',
      daysAgo: 2,
    },
  },
];
