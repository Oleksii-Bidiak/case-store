import {
  DeliveryMethod,
  MoneyEntryKind,
  OrderStatus,
  PaymentMethod,
  ReturnDecision,
  ReturnStatus,
} from '@prisma/client';
import {
  assessCreditChange,
  assessPayout,
  assessReceipt,
  outWithoutReturnMaxKop,
  outstandingReturnCreditKop,
  returnCreditFor,
  returnStatusAfterPayouts,
  type PayoutBasis,
} from './order-money';

/**
 * TASK-2047 / TASK-2046 / TASK-1968 / TASK-951 (R2 step A3) — the operator's
 * money rules: which receipts may be recorded, where a payout may come from and
 * up to how much, and what the payouts do to a return. Pure, integer kopecks,
 * independent of who is asking (permissions are the controller's business).
 */
describe('order-money — operator rules (R2 A3)', () => {
  describe('assessReceipt', () => {
    const base = {
      paymentMethod: PaymentMethod.ON_DELIVERY,
      deliveryMethod: DeliveryMethod.NOVA_POSHTA,
      reason: null,
      // 1 000 ₴ still owed.
      balanceKop: 100_000,
    };

    it.each([
      [DeliveryMethod.NOVA_POSHTA, MoneyEntryKind.COD_NOVA_POSHTA],
      [DeliveryMethod.PICKUP, MoneyEntryKind.PAID_AT_POINT],
      [DeliveryMethod.COURIER, MoneyEntryKind.PAID_TO_COURIER],
    ])('accepts the hand-over kind of %s (%s) and a bank transfer', (deliveryMethod, kind) => {
      for (const k of [kind, MoneyEntryKind.BANK_TRANSFER]) {
        expect(assessReceipt({ ...base, deliveryMethod, kind: k, amountKop: 100_000 })).toEqual({
          ok: true,
        });
      }
    });

    it('refuses a hand-over kind of another delivery method (no «Гроші від НП» on a pickup)', () => {
      expect(
        assessReceipt({
          ...base,
          deliveryMethod: DeliveryMethod.PICKUP,
          kind: MoneyEntryKind.COD_NOVA_POSHTA,
          amountKop: 100,
        }),
      ).toEqual({ ok: false, refusal: 'IN_KIND_NOT_ALLOWED' });
    });

    it('never accepts LIQPAY_PAYMENT or an OUT kind by hand', () => {
      for (const kind of [
        MoneyEntryKind.LIQPAY_PAYMENT,
        MoneyEntryKind.CASH_REFUND,
        MoneyEntryKind.LIQPAY_REFUND,
      ]) {
        expect(assessReceipt({ ...base, kind, amountKop: 100 })).toEqual({
          ok: false,
          refusal: 'IN_KIND_NOT_ALLOWED',
        });
      }
    });

    it('accepts a part payment (prepayment) without a reason', () => {
      expect(
        assessReceipt({ ...base, kind: MoneyEntryKind.BANK_TRANSFER, amountKop: 30_000 }),
      ).toEqual({ ok: true });
    });

    it('refuses an overpayment without a reason and accepts it with one', () => {
      const over = { ...base, kind: MoneyEntryKind.COD_NOVA_POSHTA, amountKop: 100_001 };
      expect(assessReceipt(over)).toEqual({ ok: false, refusal: 'OVERPAYMENT_REASON_REQUIRED' });
      expect(assessReceipt({ ...over, reason: '   ' })).toEqual({
        ok: false,
        refusal: 'OVERPAYMENT_REASON_REQUIRED',
      });
      expect(assessReceipt({ ...over, reason: 'Покупець заплатив з чайовими' })).toEqual({
        ok: true,
      });
    });

    it('treats any receipt on a settled order (balance ≤ 0) as an overpayment', () => {
      expect(
        assessReceipt({ ...base, balanceKop: 0, kind: MoneyEntryKind.BANK_TRANSFER, amountKop: 1 }),
      ).toEqual({ ok: false, refusal: 'OVERPAYMENT_REASON_REQUIRED' });
    });
  });

  describe('assessPayout — without a return', () => {
    const paid = (orderStatus: OrderStatus, over: Partial<PayoutBasis> = {}): PayoutBasis => ({
      orderStatus,
      paidKop: 100_000,
      refundedKop: 0,
      // Fully paid, nothing owed either way.
      balanceKop: 0,
      outstandingReturnCreditKop: 0,
      ...over,
    });

    it('refuses an unpaid order whatever its status', () => {
      for (const status of Object.values(OrderStatus)) {
        expect(assessPayout(paid(status, { paidKop: 0, balanceKop: 100_000 }), 1)).toEqual({
          ok: false,
          refusal: 'NOTHING_PAID',
          availableKop: 0,
        });
      }
    });

    it('refuses once everything paid is already refunded', () => {
      expect(
        assessPayout(paid(OrderStatus.CANCELLED, { refundedKop: 100_000, balanceKop: 0 }), 1),
      ).toEqual({ ok: false, refusal: 'NOTHING_PAID', availableKop: 0 });
    });

    it.each([OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING])(
      'refuses a live %s order — the operator cancels it first',
      (status) => {
        expect(assessPayout(paid(status), 1)).toEqual({
          ok: false,
          refusal: 'ORDER_LIVE',
          availableKop: 0,
        });
      },
    );

    it.each([OrderStatus.SHIPPED, OrderStatus.DELIVERED])(
      'sends a %s order through a return',
      (status) => {
        expect(assessPayout(paid(status), 1)).toEqual({
          ok: false,
          refusal: 'RETURN_REQUIRED',
          availableKop: 0,
        });
      },
    );

    it('pays a CANCELLED order back up to paid − refunded', () => {
      const basis = paid(OrderStatus.CANCELLED, { refundedKop: 30_000, balanceKop: -70_000 });
      expect(assessPayout(basis, 70_000)).toEqual({ ok: true, availableKop: 70_000 });
      expect(assessPayout(basis, 70_001)).toEqual({
        ok: false,
        refusal: 'EXCEEDS',
        availableKop: 70_000,
      });
    });

    it('keeps the shipping a derived REFUNDED order holds (TASK-1969): only an overpayment goes out', () => {
      // Goods 1 500 paid back through returns; the 70 ₴ shipping stays — balance 0.
      const settled = paid(OrderStatus.REFUNDED, {
        paidKop: 157_000,
        refundedKop: 150_000,
        balanceKop: 0,
      });
      expect(assessPayout(settled, 1)).toEqual({
        ok: false,
        refusal: 'RETURN_REQUIRED',
        availableKop: 0,
      });
      const overpaid = paid(OrderStatus.REFUNDED, {
        paidKop: 314_000,
        refundedKop: 150_000,
        balanceKop: -157_000,
      });
      expect(assessPayout(overpaid, 157_000)).toEqual({ ok: true, availableKop: 157_000 });
    });

    it('pays an overpayment back on a delivered or a live order, up to −balance', () => {
      for (const status of [OrderStatus.DELIVERED, OrderStatus.CONFIRMED]) {
        const basis = paid(status, { paidKop: 150_000, balanceKop: -50_000 });
        expect(assessPayout(basis, 50_000)).toEqual({ ok: true, availableKop: 50_000 });
        expect(assessPayout(basis, 50_001).ok).toBe(false);
      }
    });

    it('does not let money owed for a return leave as an «overpayment»', () => {
      // Return credit 40 000 not yet paid out: the balance shows −40 000, but it
      // belongs to the return and must go out through it.
      const basis = paid(OrderStatus.DELIVERED, {
        balanceKop: -40_000,
        outstandingReturnCreditKop: 40_000,
      });
      expect(assessPayout(basis, 1)).toEqual({
        ok: false,
        refusal: 'RETURN_REQUIRED',
        availableKop: 0,
      });
      expect(outWithoutReturnMaxKop(basis)).toBe(0);
    });

    it('outWithoutReturnMaxKop is the ceiling, 0 when refused', () => {
      expect(outWithoutReturnMaxKop(paid(OrderStatus.CANCELLED, { balanceKop: -100_000 }))).toBe(
        100_000,
      );
      expect(outWithoutReturnMaxKop(paid(OrderStatus.CONFIRMED))).toBe(0);
    });
  });

  describe('assessPayout — for a return', () => {
    const basis: PayoutBasis = {
      orderStatus: OrderStatus.DELIVERED,
      paidKop: 100_000,
      refundedKop: 0,
      balanceKop: -40_000,
      outstandingReturnCreditKop: 40_000,
    };
    const ret = {
      decision: ReturnDecision.REFUND,
      status: ReturnStatus.RECEIVED,
      creditKop: 40_000,
      paidOutKop: 0,
    };

    it('pays up to the return credit less its payouts', () => {
      expect(assessPayout(basis, 40_000, ret)).toEqual({ ok: true, availableKop: 40_000 });
      expect(assessPayout(basis, 15_000, { ...ret, paidOutKop: 25_000 })).toEqual({
        ok: true,
        availableKop: 15_000,
      });
      expect(assessPayout(basis, 15_001, { ...ret, paidOutKop: 25_000 })).toEqual({
        ok: false,
        refusal: 'EXCEEDS',
        availableKop: 15_000,
      });
    });

    it('never above what the order still holds (paid − refunded)', () => {
      expect(assessPayout({ ...basis, paidKop: 30_000, balanceKop: -10_000 }, 30_001, ret)).toEqual(
        { ok: false, refusal: 'EXCEEDS', availableKop: 30_000 },
      );
    });

    it('refuses on an unpaid order — the goods may come back, the money cannot go out', () => {
      expect(assessPayout({ ...basis, paidKop: 0, balanceKop: 60_000 }, 1, ret)).toEqual({
        ok: false,
        refusal: 'NOTHING_PAID',
        availableKop: 0,
      });
    });

    it.each([ReturnDecision.REPLACEMENT, ReturnDecision.REPAIR, ReturnDecision.REJECT, null])(
      'refuses a return decided %s',
      (decision) => {
        expect(assessPayout(basis, 1, { ...ret, decision })).toEqual({
          ok: false,
          refusal: 'RETURN_NOT_REFUND',
          availableKop: 0,
        });
      },
    );

    it.each([ReturnStatus.REQUESTED, ReturnStatus.APPROVED, ReturnStatus.REJECTED])(
      'refuses a %s return — the goods are not back yet',
      (status) => {
        expect(assessPayout(basis, 1, { ...ret, status })).toEqual({
          ok: false,
          refusal: 'RETURN_NOT_RECEIVED',
          availableKop: 0,
        });
      },
    );

    it('accepts a REFUNDED return while something is still owed on it', () => {
      expect(
        assessPayout(basis, 5_000, {
          ...ret,
          status: ReturnStatus.REFUNDED,
          paidOutKop: 35_000,
        }),
      ).toEqual({ ok: true, availableKop: 5_000 });
    });
  });

  describe('outstandingReturnCreditKop', () => {
    it('sums what is still owed per return, never negative', () => {
      expect(
        outstandingReturnCreditKop([
          { creditKop: 40_000, paidOutKop: 10_000 },
          { creditKop: 5_000, paidOutKop: 5_000 },
          { creditKop: 1_000, paidOutKop: 2_000 },
        ]),
      ).toBe(30_000);
    });
  });

  describe('returnStatusAfterPayouts (TASK-2046: REFUNDED is derived)', () => {
    const received = {
      status: ReturnStatus.RECEIVED,
      decision: ReturnDecision.REFUND,
      creditKop: 40_000,
      paidOutKop: 0,
    };

    it('moves a RECEIVED return to REFUNDED once the payouts cover its credit', () => {
      expect(returnStatusAfterPayouts({ ...received, paidOutKop: 39_999 })).toBe(
        ReturnStatus.RECEIVED,
      );
      expect(returnStatusAfterPayouts({ ...received, paidOutKop: 40_000 })).toBe(
        ReturnStatus.REFUNDED,
      );
    });

    it('moves a REFUNDED return back to RECEIVED when a reversal breaks the cover', () => {
      expect(
        returnStatusAfterPayouts({
          ...received,
          status: ReturnStatus.REFUNDED,
          paidOutKop: 20_000,
        }),
      ).toBe(ReturnStatus.RECEIVED);
    });

    it('never marks REFUNDED with nothing paid out (a credit reduced to 0)', () => {
      expect(returnStatusAfterPayouts({ ...received, creditKop: 0 })).toBe(ReturnStatus.RECEIVED);
    });

    it('leaves a return whose goods are not back, or that is not a refund, alone', () => {
      for (const status of [ReturnStatus.REQUESTED, ReturnStatus.APPROVED, ReturnStatus.REJECTED]) {
        expect(returnStatusAfterPayouts({ ...received, status, paidOutKop: 40_000 })).toBe(status);
      }
      expect(
        returnStatusAfterPayouts({
          ...received,
          decision: ReturnDecision.REPLACEMENT,
          creditKop: null,
          paidOutKop: 0,
        }),
      ).toBe(ReturnStatus.RECEIVED);
    });
  });

  describe('returnCreditFor (TASK-2046: «до повернення»)', () => {
    // Three lines, 1 000 ₴ promo over 3 000 ₴ of goods.
    const lines = [
      { id: 'a', quantity: 1, grossKop: 100_000 },
      { id: 'b', quantity: 3, grossKop: 150_000 },
      { id: 'c', quantity: 1, grossKop: 50_000 },
    ];

    it('is the returned units value less their promo share', () => {
      // Line b nets 150 000 − 50 000 = 100 000 for 3 units; 1 unit → 33 333.
      expect(
        returnCreditFor({
          lines,
          discountKop: 100_000,
          items: [{ orderItemId: 'b', quantity: 1 }],
          creditedBefore: new Map(),
        }),
      ).toBe(33_333);
    });

    it('telescopes over partial returns so the line sums exactly', () => {
      const one = (before: number) =>
        returnCreditFor({
          lines,
          discountKop: 100_000,
          items: [{ orderItemId: 'b', quantity: 1 }],
          creditedBefore: new Map([['b', before]]),
        });
      expect(one(0) + one(1) + one(2)).toBe(100_000);
    });

    it('sums several lines', () => {
      expect(
        returnCreditFor({
          lines,
          discountKop: 0,
          items: [
            { orderItemId: 'a', quantity: 1 },
            { orderItemId: 'c', quantity: 1 },
          ],
          creditedBefore: new Map(),
        }),
      ).toBe(150_000);
    });
  });

  describe('assessCreditChange (reduce-only)', () => {
    const base = { computedKop: 40_000, paidOutKop: 10_000 };

    it('accepts anything from what was already paid out up to the computed value', () => {
      expect(assessCreditChange({ ...base, requestedKop: 10_000 })).toEqual({ ok: true });
      expect(assessCreditChange({ ...base, requestedKop: 40_000 })).toEqual({ ok: true });
    });

    it('refuses more than the computed value', () => {
      expect(assessCreditChange({ ...base, requestedKop: 40_001 })).toEqual({
        ok: false,
        refusal: 'ABOVE_COMPUTED',
      });
    });

    it('refuses less than what was already paid out on the return', () => {
      expect(assessCreditChange({ ...base, requestedKop: 9_999 })).toEqual({
        ok: false,
        refusal: 'BELOW_PAID_OUT',
      });
    });
  });
});
