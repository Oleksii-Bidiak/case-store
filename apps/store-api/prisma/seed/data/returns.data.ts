import type {
  RepairResult,
  ReturnChannel,
  ReturnDecision,
  ReturnOutcome,
  ReturnRepairStep,
  ReturnStatus,
} from '@prisma/client';
import type { SeedActor } from '../types';

/**
 * Returns (RMA) as the seed shows them (TASK-2569): every status, every
 * decision, a refusal and a changed decision with their reasons, a lowered
 * credit, a repair stopped half-way and one finished, an UNREPAIRABLE result
 * re-decided as a refund, all three channels — and one order that becomes
 * REFUNDED because its returns cover every line, paid out by LiqPay and in cash.
 *
 * Every `at` is hours after the ORDER was placed, so a return reads against the
 * order's own timeline. `lib/return-plan.ts` walks the events through the
 * return state machine and the money rules and refuses what the shop could not
 * have recorded; `status` is what that walk must arrive at.
 */
export interface ReturnSpec {
  key: string;
  /** Seed key of the order (data/orders.data.ts). */
  order: string;
  channel: ReturnChannel;
  requestedOutcome?: ReturnOutcome;
  /** The customer's words. */
  reason: string;
  /** Lines by their index in the order's `items`. */
  items: { line: number; quantity: number }[];
  requestedAt: number;
  decisions?: { decision: ReturnDecision; reason?: string; at: number }[];
  repair?: {
    step: ReturnRepairStep;
    at: number;
    result?: RepairResult;
    destination?: string;
    ttn?: string;
    note?: string;
  }[];
  /** The goods arrived back (PATCH → RECEIVED), optionally credited to stock. */
  received?: { at: number; restock: boolean };
  /** «До повернення» lowered by the operator, UAH. */
  credit?: { lowerTo: number; reason: string; at: number };
  payouts?: { kind: 'LIQPAY_REFUND' | 'CASH_REFUND' | 'TRANSFER_REFUND'; at: number }[];
  operatorNotes?: string;
  /** Who acts for the shop on this return. */
  operator?: SeedActor;
  status: ReturnStatus;
}

export const returnSpecs: ReturnSpec[] = [
  {
    key: 'nataliia-2-glass',
    order: 'nataliia-2',
    channel: 'ACCOUNT',
    requestedOutcome: 'REFUND',
    reason: 'Скло не підійшло — у мене інша модель телефону.',
    items: [{ line: 0, quantity: 1 }],
    requestedAt: 90,
    status: 'REQUESTED',
  },
  {
    key: 'guest-2-replacement',
    order: 'guest-2',
    channel: 'GUEST_LINK',
    requestedOutcome: 'REPLACEMENT',
    reason: 'Не працює лівий навушник.',
    items: [{ line: 0, quantity: 1 }],
    requestedAt: 120,
    decisions: [{ decision: 'REPLACEMENT', at: 130 }],
    operatorNotes: 'Нову пару відправимо, щойно отримаємо цю.',
    status: 'APPROVED',
  },
  {
    key: 'nataliia-1-case',
    order: 'nataliia-1',
    channel: 'ACCOUNT',
    requestedOutcome: 'REFUND',
    reason: 'Передумала, колір не той.',
    items: [{ line: 0, quantity: 1 }],
    requestedAt: 200,
    decisions: [
      {
        decision: 'REJECT',
        reason: 'Чохол має сліди використання, тому повернути його не можна.',
        at: 210,
      },
    ],
    status: 'REJECTED',
  },
  {
    key: 'dmytro-1-charger',
    order: 'dmytro-1',
    channel: 'ACCOUNT',
    requestedOutcome: 'REFUND',
    reason: 'Зарядка сильно гріється.',
    items: [{ line: 1, quantity: 1 }],
    requestedAt: 150,
    decisions: [{ decision: 'REFUND', at: 160 }],
    received: { at: 200, restock: true },
    credit: {
      lowerTo: 1500,
      reason: 'Повернуто без оригінальної коробки — утримано частину вартості.',
      at: 205,
    },
    status: 'RECEIVED',
  },
  {
    key: 'mariia-2-phone',
    order: 'mariia-2',
    channel: 'ACCOUNT',
    requestedOutcome: 'REFUND',
    reason: 'Не підійшов, повертаю в межах 14 днів.',
    items: [{ line: 0, quantity: 1 }],
    requestedAt: 100,
    decisions: [{ decision: 'REFUND', at: 105 }],
    received: { at: 150, restock: true },
    payouts: [{ kind: 'LIQPAY_REFUND', at: 160 }],
    status: 'REFUNDED',
  },
  {
    key: 'mariia-2-charger',
    order: 'mariia-2',
    channel: 'OPERATOR',
    requestedOutcome: 'REFUND',
    reason: 'Зарядку теж повертаю — подзвонила в магазин.',
    items: [{ line: 1, quantity: 1 }],
    requestedAt: 101,
    decisions: [{ decision: 'REFUND', at: 105 }],
    received: { at: 150, restock: true },
    payouts: [{ kind: 'CASH_REFUND', at: 161 }],
    status: 'REFUNDED',
  },
  {
    key: 'john-2-repair',
    order: 'john-2',
    channel: 'ACCOUNT',
    requestedOutcome: 'REPAIR',
    reason: 'Перестала заряджати через два тижні.',
    items: [{ line: 0, quantity: 1 }],
    requestedAt: 300,
    decisions: [{ decision: 'REPAIR', at: 310 }],
    repair: [
      { step: 'ACCEPTED', at: 320 },
      {
        step: 'SENT_TO_SERVICE',
        at: 330,
        destination: 'Сервісний центр Belkin, Київ',
        ttn: '20451234567811',
      },
    ],
    status: 'APPROVED',
  },
  {
    key: 'oksana-3-repair',
    order: 'oksana-3',
    channel: 'ACCOUNT',
    requestedOutcome: 'REPAIR',
    reason: 'Тріщить правий навушник.',
    items: [{ line: 0, quantity: 1 }],
    requestedAt: 200,
    decisions: [{ decision: 'REPAIR', at: 210 }],
    repair: [
      { step: 'ACCEPTED', at: 220 },
      {
        step: 'SENT_TO_SERVICE',
        at: 230,
        destination: 'Авторизований сервіс Apple, Київ',
        ttn: '20451234567812',
      },
      { step: 'RETURNED_FROM_SERVICE', at: 400, result: 'REPAIRED', note: 'Замінено динамік.' },
      { step: 'HANDED_TO_CUSTOMER', at: 420 },
    ],
    status: 'APPROVED',
  },
  {
    key: 'taras-4-unrepairable',
    order: 'taras-4',
    channel: 'OPERATOR',
    requestedOutcome: 'REPAIR',
    reason: 'Навушники перестали заряджатися.',
    items: [{ line: 0, quantity: 1 }],
    requestedAt: 120,
    decisions: [
      { decision: 'REPAIR', at: 125 },
      {
        decision: 'REFUND',
        reason: 'Сервіс визнав навушники непридатними до ремонту — повертаємо кошти.',
        at: 310,
      },
    ],
    repair: [
      { step: 'ACCEPTED', at: 130 },
      {
        step: 'SENT_TO_SERVICE',
        at: 135,
        destination: 'Сервісний центр JBL, Київ',
        ttn: '20451234567813',
      },
      {
        step: 'RETURNED_FROM_SERVICE',
        at: 300,
        result: 'UNREPAIRABLE',
        note: 'Плата живлення не підлягає ремонту.',
      },
    ],
    // Back at the shop from the service centre; defective, so not restocked.
    received: { at: 312, restock: false },
    payouts: [{ kind: 'TRANSFER_REFUND', at: 330 }],
    status: 'REFUNDED',
  },
];
