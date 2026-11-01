import { OrderStatus } from '@prisma/client';
import {
  type OrderStatusDerivationInput,
  deriveBalance,
  deriveOrderStatus,
  isOrderFullyRefunded,
} from './order-money';

/**
 * TASK-1969 / TASK-1970 (R2 A4) — the order's REFUNDED status is DERIVED from
 * the money ledger: SHIPPED/DELIVERED ∧ every line covered by REFUND-decided
 * returns ∧ each of them paid out up to its credit ∧ something actually went
 * back. A reversal that breaks it sends the order back where it came from.
 * Pure, integer kopecks.
 */
describe('order-money — derived order REFUNDED (TASK-1969)', () => {
  // Two lines: 2 cases + 1 charger. Shipping (never in a credit) is not a line.
  const LINES = [
    { id: 'line-case', quantity: 2 },
    { id: 'line-charger', quantity: 1 },
  ];

  const everythingBack = {
    creditKop: 150_000,
    paidOutKop: 150_000,
    items: [
      { orderItemId: 'line-case', quantity: 2 },
      { orderItemId: 'line-charger', quantity: 1 },
    ],
  };

  const input = (over: Partial<OrderStatusDerivationInput> = {}): OrderStatusDerivationInput => ({
    orderStatus: OrderStatus.DELIVERED,
    refundedKop: 150_000,
    lines: LINES,
    refundReturns: [everythingBack],
    payoutUndone: false,
    refundedFrom: null,
    ...over,
  });

  describe('isOrderFullyRefunded', () => {
    it('is true when every line is returned and each return is paid out', () => {
      expect(isOrderFullyRefunded(input())).toBe(true);
    });

    it('sums lines across several returns (one line returned in two parts)', () => {
      expect(
        isOrderFullyRefunded(
          input({
            refundReturns: [
              {
                creditKop: 50_000,
                paidOutKop: 50_000,
                items: [{ orderItemId: 'line-case', quantity: 1 }],
              },
              {
                creditKop: 100_000,
                paidOutKop: 100_000,
                items: [
                  { orderItemId: 'line-case', quantity: 1 },
                  { orderItemId: 'line-charger', quantity: 1 },
                ],
              },
            ],
          }),
        ),
      ).toBe(true);
    });

    it('is false while one line is not returned at all', () => {
      expect(
        isOrderFullyRefunded(
          input({
            refundReturns: [
              {
                creditKop: 100_000,
                paidOutKop: 100_000,
                items: [{ orderItemId: 'line-case', quantity: 2 }],
              },
            ],
          }),
        ),
      ).toBe(false);
    });

    it('is false while a line is returned only in part', () => {
      expect(
        isOrderFullyRefunded(
          input({
            refundReturns: [
              {
                ...everythingBack,
                items: [
                  { orderItemId: 'line-case', quantity: 1 },
                  { orderItemId: 'line-charger', quantity: 1 },
                ],
              },
            ],
          }),
        ),
      ).toBe(false);
    });

    it('is false while a return is paid out below its credit', () => {
      expect(
        isOrderFullyRefunded(
          input({ refundReturns: [{ ...everythingBack, paidOutKop: 149_999 }] }),
        ),
      ).toBe(false);
    });

    it('is false with nothing refunded on the order (no money ever went back)', () => {
      expect(
        isOrderFullyRefunded(
          input({
            refundedKop: 0,
            refundReturns: [{ ...everythingBack, creditKop: 0, paidOutKop: 0 }],
          }),
        ),
      ).toBe(false);
    });

    it('is false for an order without lines', () => {
      expect(isOrderFullyRefunded(input({ lines: [], refundReturns: [] }))).toBe(false);
    });
  });

  describe('deriveOrderStatus', () => {
    it.each([OrderStatus.SHIPPED, OrderStatus.DELIVERED])(
      'moves %s to REFUNDED once everything is back',
      (orderStatus) => {
        expect(deriveOrderStatus(input({ orderStatus }))).toBe(OrderStatus.REFUNDED);
      },
    );

    it('keeps DELIVERED (payment PARTIALLY_REFUNDED) while one line is not returned', () => {
      expect(
        deriveOrderStatus(
          input({
            refundedKop: 100_000,
            refundReturns: [
              {
                creditKop: 100_000,
                paidOutKop: 100_000,
                items: [{ orderItemId: 'line-case', quantity: 2 }],
              },
            ],
          }),
        ),
      ).toBe(OrderStatus.DELIVERED);
    });

    it('reaches REFUNDED although shipping was never refunded', () => {
      // total 1 570 ₴ = goods 1 500 + shipping 70; only the goods' credit went back.
      expect(deriveOrderStatus(input({ refundedKop: 150_000 }))).toBe(OrderStatus.REFUNDED);
    });

    it.each([
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.CANCELLED,
    ])('never derives REFUNDED from %s', (orderStatus) => {
      expect(deriveOrderStatus(input({ orderStatus }))).toBe(orderStatus);
    });

    it.each([OrderStatus.SHIPPED, OrderStatus.DELIVERED])(
      'sends a REFUNDED order back to %s when a reversal breaks the cover',
      (refundedFrom) => {
        expect(
          deriveOrderStatus(
            input({
              orderStatus: OrderStatus.REFUNDED,
              refundedKop: 100_000,
              refundReturns: [{ ...everythingBack, paidOutKop: 100_000 }],
              payoutUndone: true,
              refundedFrom,
            }),
          ),
        ).toBe(refundedFrom);
      },
    );

    it('keeps a REFUNDED order REFUNDED when the cover still holds after a reversal', () => {
      expect(
        deriveOrderStatus(
          input({
            orderStatus: OrderStatus.REFUNDED,
            payoutUndone: true,
            refundedFrom: OrderStatus.DELIVERED,
          }),
        ),
      ).toBe(OrderStatus.REFUNDED);
    });

    it('keeps a legacy REFUNDED order (no returns) as it is when no payout was undone', () => {
      // Set by hand before R2: no return covers its lines, yet a receipt or a
      // status-change recompute must not quietly flip it to DELIVERED.
      expect(
        deriveOrderStatus(
          input({
            orderStatus: OrderStatus.REFUNDED,
            refundReturns: [],
            refundedFrom: OrderStatus.DELIVERED,
          }),
        ),
      ).toBe(OrderStatus.REFUNDED);
    });

    it('moves a legacy REFUNDED order back when a reversal happens on it', () => {
      expect(
        deriveOrderStatus(
          input({
            orderStatus: OrderStatus.REFUNDED,
            refundReturns: [],
            payoutUndone: true,
            refundedFrom: OrderStatus.DELIVERED,
          }),
        ),
      ).toBe(OrderStatus.DELIVERED);
    });

    it('keeps REFUNDED when the status it came from is unknown or was not SHIPPED/DELIVERED', () => {
      for (const refundedFrom of [null, OrderStatus.CANCELLED, OrderStatus.PROCESSING]) {
        expect(
          deriveOrderStatus(
            input({
              orderStatus: OrderStatus.REFUNDED,
              refundReturns: [],
              payoutUndone: true,
              refundedFrom,
            }),
          ),
        ).toBe(OrderStatus.REFUNDED);
      }
    });
  });

  describe('deriveBalance on a REFUNDED order', () => {
    it('is 0 for a derived REFUNDED order whose shipping the shop kept', () => {
      // total 1 570, credit 1 500, paid 1 570, refunded 1 500 → settled.
      expect(
        deriveBalance({
          totalKop: 157_000,
          returnCreditKop: 150_000,
          paidKop: 157_000,
          refundedKop: 150_000,
          orderStatus: OrderStatus.REFUNDED,
        }),
      ).toBe(0);
    });

    it('is 0 for a legacy REFUNDED order (everything back, no return credit)', () => {
      expect(
        deriveBalance({
          totalKop: 157_000,
          returnCreditKop: 0,
          paidKop: 157_000,
          refundedKop: 157_000,
          orderStatus: OrderStatus.REFUNDED,
        }),
      ).toBe(0);
    });

    it('still shows an overpayment owed back on a REFUNDED order', () => {
      // Paid twice (two tabs): 3 140 in, 1 500 back; 1 570 more is owed back.
      expect(
        deriveBalance({
          totalKop: 157_000,
          returnCreditKop: 150_000,
          paidKop: 314_000,
          refundedKop: 150_000,
          orderStatus: OrderStatus.REFUNDED,
        }),
      ).toBe(-157_000);
    });

    it('never shows a debt on a REFUNDED order', () => {
      expect(
        deriveBalance({
          totalKop: 157_000,
          returnCreditKop: 150_000,
          paidKop: 150_000,
          refundedKop: 150_000,
          orderStatus: OrderStatus.REFUNDED,
        }),
      ).toBe(0);
    });
  });
});
