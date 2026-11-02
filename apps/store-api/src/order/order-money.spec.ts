import {
  DeliveryMethod,
  MoneyDirection,
  MoneyEntryKind,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';
import {
  IN_KINDS,
  OUT_KINDS,
  allocateReturnCredit,
  allowedInKinds,
  canReverse,
  deriveBalance,
  derivePaymentStatus,
  directionOf,
  ledgerTotals,
  providerRefundAvailableKop,
  reversalDraft,
  unitsCreditKop,
} from './order-money';

/**
 * TASK-2047 / TASK-2046 / TASK-951 — the derived rules of the order money ledger
 * (R2 "payment from one place", plan §1). Pure: every number is integer kopecks.
 */
describe('order-money', () => {
  describe('derivePaymentStatus', () => {
    const TOTAL = 100_000;

    it.each<[string, number, number, boolean, PaymentStatus]>([
      ['nothing paid', 0, 0, false, PaymentStatus.PENDING],
      ['nothing paid, last attempt failed', 0, 0, true, PaymentStatus.FAILED],
      ['part paid', 40_000, 0, false, PaymentStatus.PARTIALLY_PAID],
      [
        'part paid, a later attempt failed — still part paid',
        40_000,
        0,
        true,
        PaymentStatus.PARTIALLY_PAID,
      ],
      ['paid exactly', TOTAL, 0, false, PaymentStatus.PAID],
      ['overpaid', TOTAL + 1, 0, false, PaymentStatus.PAID],
      ['paid then a failed attempt — still paid', TOTAL, 0, true, PaymentStatus.PAID],
      ['all paid money back', TOTAL, TOTAL, false, PaymentStatus.REFUNDED],
      ['part paid, all of it back', 40_000, 40_000, false, PaymentStatus.REFUNDED],
      ['some money back', TOTAL, 1, false, PaymentStatus.PARTIALLY_REFUNDED],
      ['part paid, some back', 40_000, 10_000, false, PaymentStatus.PARTIALLY_REFUNDED],
    ])('%s → %s', (_label, paidKop, refundedKop, lastAttemptFailed, expected) => {
      expect(
        derivePaymentStatus({ totalKop: TOTAL, paidKop, refundedKop, lastAttemptFailed }),
      ).toBe(expected);
    });

    it('a zero-total order with nothing paid stays PENDING, not PAID', () => {
      expect(
        derivePaymentStatus({ totalKop: 0, paidKop: 0, refundedKop: 0, lastAttemptFailed: false }),
      ).toBe(PaymentStatus.PENDING);
    });
  });

  describe('derivePaymentStatus — a legacy refund label with no amount (TASK-2047 A2)', () => {
    const base = { totalKop: 100_000, paidKop: 100_000, lastAttemptFailed: false };

    it.each([PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED])(
      'keeps %s while no money has gone out on the ledger',
      (label) => {
        expect(derivePaymentStatus({ ...base, refundedKop: 0, legacyRefundLabel: label })).toBe(
          label,
        );
      },
    );

    it('derives as usual once a refund is on the ledger', () => {
      expect(
        derivePaymentStatus({
          ...base,
          refundedKop: 100_000,
          legacyRefundLabel: PaymentStatus.PARTIALLY_REFUNDED,
        }),
      ).toBe(PaymentStatus.REFUNDED);
    });

    it('ignores a label that is not a refund label', () => {
      expect(
        derivePaymentStatus({ ...base, refundedKop: 0, legacyRefundLabel: PaymentStatus.PAID }),
      ).toBe(PaymentStatus.PAID);
    });
  });

  describe('providerRefundAvailableKop', () => {
    it('is what is left on the attempt when the order has more headroom', () => {
      expect(
        providerRefundAvailableKop({
          paymentInKop: 100_000,
          paymentRefundedKop: 60_000,
          orderPaidKop: 150_000,
          orderRefundedKop: 60_000,
        }),
      ).toBe(40_000);
    });

    it('is capped by the order ceiling (paid − refunded across every kind)', () => {
      expect(
        providerRefundAvailableKop({
          paymentInKop: 100_000,
          paymentRefundedKop: 0,
          orderPaidKop: 100_000,
          orderRefundedKop: 70_000,
        }),
      ).toBe(30_000);
    });

    it('never goes below zero', () => {
      expect(
        providerRefundAvailableKop({
          paymentInKop: 0,
          paymentRefundedKop: 0,
          orderPaidKop: 0,
          orderRefundedKop: 0,
        }),
      ).toBe(0);
    });
  });

  describe('deriveBalance', () => {
    it('total − returnCredit − paid + refunded on a live order', () => {
      expect(
        deriveBalance({
          totalKop: 100_000,
          returnCreditKop: 30_000,
          paidKop: 50_000,
          refundedKop: 10_000,
          orderStatus: OrderStatus.DELIVERED,
        }),
      ).toBe(100_000 - 30_000 - 50_000 + 10_000);
    });

    it('is negative when the shop owes the customer', () => {
      expect(
        deriveBalance({
          totalKop: 100_000,
          returnCreditKop: 40_000,
          paidKop: 100_000,
          refundedKop: 0,
          orderStatus: OrderStatus.DELIVERED,
        }),
      ).toBe(-40_000);
    });

    // REFUNDED (derived since TASK-1969) has its own rule — order-money-refunded.spec.ts.
    it.each([OrderStatus.CANCELLED])(
      'a %s order owes nothing for goods: unpaid → 0, paid → the shop owes it all back',
      (orderStatus) => {
        expect(
          deriveBalance({
            totalKop: 100_000,
            returnCreditKop: 0,
            paidKop: 0,
            refundedKop: 0,
            orderStatus,
          }),
        ).toBe(0);
        expect(
          deriveBalance({
            totalKop: 100_000,
            returnCreditKop: 0,
            paidKop: 100_000,
            refundedKop: 25_000,
            orderStatus,
          }),
        ).toBe(-75_000);
      },
    );
  });

  describe('allocateReturnCredit', () => {
    it('without a discount every line keeps its gross value', () => {
      expect(allocateReturnCredit([{ grossKop: 1_000 }, { grossKop: 2_550 }], 0)).toEqual([
        1_000, 2_550,
      ]);
    });

    it('splits the discount proportionally when it divides evenly', () => {
      expect(allocateReturnCredit([{ grossKop: 10_000 }, { grossKop: 30_000 }], 4_000)).toEqual([
        9_000, 27_000,
      ]);
    });

    it('hands the leftover kopecks to the largest remainders, ties to the earlier line', () => {
      // 100 kop over three equal lines: 33.33 each → floors 33, one kopeck left over.
      const credits = allocateReturnCredit(
        [{ grossKop: 1_000 }, { grossKop: 1_000 }, { grossKop: 1_000 }],
        100,
      );
      expect(credits).toEqual([966, 967, 967]);
    });

    it.each([
      [[{ grossKop: 333 }, { grossKop: 667 }, { grossKop: 1 }], 101],
      [[{ grossKop: 19_999 }, { grossKop: 7 }, { grossKop: 12_345 }, { grossKop: 50_000 }], 9_999],
      [[{ grossKop: 1 }, { grossKop: 1 }, { grossKop: 1 }], 2],
      [[{ grossKop: 89_900_000 }, { grossKop: 49_900_000 }], 13_333_337],
    ])('Σ credits = Σ gross − discount exactly (%j, %i)', (lines, discountKop) => {
      const credits = allocateReturnCredit(lines, discountKop);
      const gross = lines.reduce((sum, line) => sum + line.grossKop, 0);
      expect(credits.reduce((sum, c) => sum + c, 0)).toBe(gross - discountKop);
      credits.forEach((credit, i) => {
        expect(Number.isInteger(credit)).toBe(true);
        expect(credit).toBeGreaterThanOrEqual(0);
        expect(credit).toBeLessThanOrEqual(lines[i].grossKop);
      });
    });

    it('clamps a discount larger than the goods to the goods', () => {
      expect(allocateReturnCredit([{ grossKop: 500 }, { grossKop: 500 }], 5_000)).toEqual([0, 0]);
    });

    it('returns an empty list for no lines', () => {
      expect(allocateReturnCredit([], 100)).toEqual([]);
    });

    it('refuses a non-integer amount', () => {
      expect(() => allocateReturnCredit([{ grossKop: 10.5 }], 0)).toThrow();
      expect(() => allocateReturnCredit([{ grossKop: 10 }], 0.5)).toThrow();
    });
  });

  describe('unitsCreditKop', () => {
    it('returning every unit gives the whole line credit', () => {
      expect(unitsCreditKop(1_001, 3, 0, 3)).toBe(1_001);
    });

    it('partial returns telescope: their sum is the line credit, never more', () => {
      const line = 1_001;
      const first = unitsCreditKop(line, 3, 0, 1);
      const second = unitsCreditKop(line, 3, 1, 1);
      const third = unitsCreditKop(line, 3, 2, 1);
      expect([first, second, third]).toEqual([333, 334, 334]);
      expect(first + second + third).toBe(line);
    });

    it('caps units beyond the bought quantity', () => {
      expect(unitsCreditKop(900, 2, 2, 1)).toBe(0);
      expect(unitsCreditKop(900, 2, 1, 5)).toBe(450);
    });
  });

  describe('allowedInKinds', () => {
    const DELIVERY_KIND: Record<DeliveryMethod, MoneyEntryKind | null> = {
      NOVA_POSHTA: MoneyEntryKind.COD_NOVA_POSHTA,
      PICKUP: MoneyEntryKind.PAID_AT_POINT,
      COURIER: MoneyEntryKind.PAID_TO_COURIER,
      OTHER: null,
    };

    const cases = Object.values(PaymentMethod).flatMap((payment) =>
      Object.values(DeliveryMethod).map((delivery) => [payment, delivery] as const),
    );

    it.each(cases)(
      '%s × %s: the delivery kind plus a bank transfer, never LiqPay',
      (payment, delivery) => {
        const kinds = allowedInKinds(payment, delivery);
        const expected = [DELIVERY_KIND[delivery], MoneyEntryKind.BANK_TRANSFER].filter(
          (kind): kind is MoneyEntryKind => kind !== null,
        );
        expect([...kinds].sort()).toEqual([...expected].sort());
        expect(kinds).not.toContain(MoneyEntryKind.LIQPAY_PAYMENT);
        kinds.forEach((kind) => expect(directionOf(kind)).toBe(MoneyDirection.IN));
      },
    );

    it('lists the bank transfer first when that is how the customer chose to pay', () => {
      expect(allowedInKinds(PaymentMethod.BANK_TRANSFER, DeliveryMethod.PICKUP)[0]).toBe(
        MoneyEntryKind.BANK_TRANSFER,
      );
      expect(allowedInKinds(PaymentMethod.ON_DELIVERY, DeliveryMethod.PICKUP)[0]).toBe(
        MoneyEntryKind.PAID_AT_POINT,
      );
    });
  });

  describe('directionOf', () => {
    it('every kind belongs to exactly one direction', () => {
      expect([...IN_KINDS, ...OUT_KINDS].sort()).toEqual(Object.values(MoneyEntryKind).sort());
      IN_KINDS.forEach((kind) => expect(directionOf(kind)).toBe(MoneyDirection.IN));
      OUT_KINDS.forEach((kind) => expect(directionOf(kind)).toBe(MoneyDirection.OUT));
    });
  });

  describe('ledgerTotals', () => {
    const entry = (
      over: Partial<{
        id: string;
        direction: MoneyDirection;
        amountKop: number;
        reversalOfId: string | null;
        voidedAt: Date | null;
      }>,
    ) => ({
      id: 'e',
      direction: MoneyDirection.IN,
      amountKop: 0,
      reversalOfId: null,
      voidedAt: null,
      ...over,
    });

    it('sums each direction, net of its reversals, ignoring voided rows', () => {
      expect(
        ledgerTotals([
          entry({ id: 'a', amountKop: 50_000 }),
          entry({ id: 'b', amountKop: 20_000 }),
          entry({ id: 'c', amountKop: 20_000, reversalOfId: 'b' }),
          entry({ id: 'd', direction: MoneyDirection.OUT, amountKop: 10_000 }),
          entry({
            id: 'e',
            direction: MoneyDirection.OUT,
            amountKop: 7_000,
            voidedAt: new Date(),
          }),
        ]),
      ).toEqual({ paidKop: 50_000, refundedKop: 10_000 });
    });

    it('an empty ledger is zero both ways', () => {
      expect(ledgerTotals([])).toEqual({ paidKop: 0, refundedKop: 0 });
    });
  });

  describe('canReverse / reversalDraft', () => {
    const manual = {
      id: 'in-1',
      direction: MoneyDirection.IN,
      kind: MoneyEntryKind.COD_NOVA_POSHTA,
      amountKop: 12_345,
      reversalOfId: null,
      voidedAt: null,
      reversed: false,
    };

    it('a manual entry can be reversed', () => {
      expect(canReverse(manual)).toEqual({ ok: true });
    });

    it('never a reversal of a reversal', () => {
      expect(canReverse({ ...manual, reversalOfId: 'other' })).toEqual({
        ok: false,
        reason: 'REVERSAL_OF_REVERSAL',
      });
    });

    it.each([MoneyEntryKind.LIQPAY_PAYMENT, MoneyEntryKind.LIQPAY_REFUND])(
      'never a LiqPay entry (%s) — the provider owns it',
      (kind) => {
        expect(canReverse({ ...manual, kind })).toEqual({ ok: false, reason: 'PROVIDER_ENTRY' });
      },
    );

    it('never a voided entry — it moved no money', () => {
      expect(canReverse({ ...manual, voidedAt: new Date() })).toEqual({
        ok: false,
        reason: 'VOIDED',
      });
    });

    it('never twice', () => {
      expect(canReverse({ ...manual, reversed: true })).toEqual({
        ok: false,
        reason: 'ALREADY_REVERSED',
      });
    });

    it('the draft mirrors the original: same direction, kind and amount', () => {
      expect(reversalDraft(manual)).toEqual({
        direction: MoneyDirection.IN,
        kind: MoneyEntryKind.COD_NOVA_POSHTA,
        amountKop: 12_345,
        reversalOfId: 'in-1',
      });
    });
  });
});
