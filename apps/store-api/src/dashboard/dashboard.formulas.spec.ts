import {
  computeAverageOrderValue,
  computeRepeatBuyerRate,
  type UserOrderCount,
} from './dashboard.formulas';

/**
 * Pure unit tests for the dashboard formulas (TASK-249-A). No Prisma, no DB, no
 * mocks — just the arithmetic and its zero-denominator guards.
 */
describe('dashboard.formulas', () => {
  describe('computeAverageOrderValue', () => {
    it('returns 0 when there are no paid orders (no NaN/Infinity)', () => {
      const result = computeAverageOrderValue(0, 0);
      expect(result).toBe(0);
      expect(Number.isFinite(result)).toBe(true);
    });

    it('returns 0 when revenue is non-zero but the paid-order count is 0', () => {
      // Guards divide-by-zero even if revenue somehow arrives non-zero.
      expect(computeAverageOrderValue(1000, 0)).toBe(0);
    });

    it('divides revenue by the paid-order count in the normal case', () => {
      expect(computeAverageOrderValue(300, 3)).toBe(100);
      expect(computeAverageOrderValue(150.5, 2)).toBe(75.25);
    });

    it('returns 0 when revenue is 0 but the count is non-zero', () => {
      expect(computeAverageOrderValue(0, 5)).toBe(0);
    });
  });

  describe('computeRepeatBuyerRate', () => {
    it('returns 0 for an empty customer set', () => {
      expect(computeRepeatBuyerRate([])).toBe(0);
    });

    it('returns 0 when every customer has only a single order', () => {
      const counts: UserOrderCount[] = [
        { userId: 'a', count: 1 },
        { userId: 'b', count: 1 },
      ];
      expect(computeRepeatBuyerRate(counts)).toBe(0);
    });

    it('counts a customer with exactly 2 orders as a repeat buyer', () => {
      const counts: UserOrderCount[] = [
        { userId: 'a', count: 2 },
        { userId: 'b', count: 1 },
      ];
      expect(computeRepeatBuyerRate(counts)).toBe(0.5);
    });

    it('returns 1 when every customer is a repeat buyer', () => {
      const counts: UserOrderCount[] = [
        { userId: 'a', count: 2 },
        { userId: 'b', count: 3 },
      ];
      expect(computeRepeatBuyerRate(counts)).toBe(1);
    });
  });
});
