import { PaymentAttemptStatus } from '@prisma/client';
import { attemptStatusAfterRefunds, providerRefundMatches } from './order-money';

/**
 * The LiqPay attempt's own status and the `reversed` match rule (TASK-1500 /
 * TASK-2336, R2 review). Pure: every number is integer kopecks.
 */
describe('order-money — LiqPay attempt rules', () => {
  describe('attemptStatusAfterRefunds', () => {
    it('stays SUCCEEDED while the CONFIRMED refunds are below what came in', () => {
      expect(
        attemptStatusAfterRefunds({
          current: PaymentAttemptStatus.SUCCEEDED,
          inKop: 10_000,
          confirmedRefundedKop: 6_000,
        }),
      ).toBe(PaymentAttemptStatus.SUCCEEDED);
    });

    it('becomes REFUNDED once the CONFIRMED refunds cover what came in', () => {
      expect(
        attemptStatusAfterRefunds({
          current: PaymentAttemptStatus.SUCCEEDED,
          inKop: 10_000,
          confirmedRefundedKop: 10_000,
        }),
      ).toBe(PaymentAttemptStatus.REFUNDED);
    });

    it('goes back to SUCCEEDED when a REFUNDED attempt is no longer covered', () => {
      expect(
        attemptStatusAfterRefunds({
          current: PaymentAttemptStatus.REFUNDED,
          inKop: 10_000,
          confirmedRefundedKop: 6_000,
        }),
      ).toBe(PaymentAttemptStatus.SUCCEEDED);
    });

    it('never marks an attempt that brought nothing in as REFUNDED', () => {
      expect(
        attemptStatusAfterRefunds({
          current: PaymentAttemptStatus.SUCCEEDED,
          inKop: 0,
          confirmedRefundedKop: 0,
        }),
      ).toBe(PaymentAttemptStatus.SUCCEEDED);
    });

    it.each([
      PaymentAttemptStatus.PENDING,
      PaymentAttemptStatus.FAILED,
      PaymentAttemptStatus.EXPIRED,
    ])('leaves a %s attempt alone', (current) => {
      expect(
        attemptStatusAfterRefunds({ current, inKop: 10_000, confirmedRefundedKop: 10_000 }),
      ).toBe(current);
    });

    it('refuses float kopecks', () => {
      expect(() =>
        attemptStatusAfterRefunds({
          current: PaymentAttemptStatus.SUCCEEDED,
          inKop: 10_000.5,
          confirmedRefundedKop: 0,
        }),
      ).toThrow(RangeError);
    });
  });

  describe('providerRefundMatches', () => {
    it('matches when the provider reported no amount', () => {
      expect(providerRefundMatches({ requestedKop: 40_000, providerAmountKop: null })).toBe(true);
    });

    it('matches when the provider amount equals the request', () => {
      expect(providerRefundMatches({ requestedKop: 40_000, providerAmountKop: 40_000 })).toBe(true);
    });

    it('does not match a different amount', () => {
      expect(providerRefundMatches({ requestedKop: 40_000, providerAmountKop: 30_000 })).toBe(
        false,
      );
    });
  });
});
