import { centsToString, lineTotalCents, sumLineCents, toCents, toTwoDecimals } from './money.util';

/**
 * TASK-807: this file is the ONE implementation of cents ↔ decimal-string
 * conversion. Copies of it in discount/order had already drifted — one clamped
 * negatives to 0, another rendered -50 cents as "-1.-50". These cases pin the
 * behaviour every caller now shares.
 */
describe('money.util', () => {
  describe('toCents', () => {
    it('parses a decimal string into integer cents', () => {
      expect(toCents('29.99')).toBe(2999);
    });

    it('accepts anything with toString (Prisma.Decimal-shaped)', () => {
      expect(toCents({ toString: () => '100.5' })).toBe(10050);
    });

    it('rounds to the nearest cent instead of flooring float noise', () => {
      // 0.07 * 100 = 7.000000000000001 in IEEE-754 — Math.round, not Math.floor
      expect(toCents('0.07')).toBe(7);
      expect(toCents('19.99')).toBe(1999);
    });

    it('parses zero and negatives', () => {
      expect(toCents('0')).toBe(0);
      expect(toCents('-0.50')).toBe(-50);
    });
  });

  describe('centsToString', () => {
    it('renders a negative amount with one leading sign', () => {
      expect(centsToString(-50)).toBe('-0.50');
      expect(centsToString(-1234)).toBe('-12.34');
    });

    it('renders zero as 0.00', () => {
      expect(centsToString(0)).toBe('0.00');
    });

    it('pads the cents to two digits', () => {
      expect(centsToString(5)).toBe('0.05');
      expect(centsToString(49900)).toBe('499.00');
    });

    it('round-trips with toCents', () => {
      for (const value of ['0.00', '0.01', '9.99', '1234.56', '-0.50']) {
        expect(centsToString(toCents(value))).toBe(value);
      }
    });
  });

  describe('toTwoDecimals', () => {
    it('pads a Decimal-ish value to two decimals', () => {
      expect(toTwoDecimals('499')).toBe('499.00');
      expect(toTwoDecimals({ toString: () => '12.5' })).toBe('12.50');
    });
  });

  describe('lineTotalCents', () => {
    it('multiplies the rounded unit price in cents by the quantity', () => {
      // Rounding happens per UNIT, before the multiplication — the same order
      // the cart, the order and the discount preview all follow.
      expect(lineTotalCents('29.99', 3)).toBe(8997);
      expect(lineTotalCents({ toString: () => '0.07' }, 3)).toBe(21);
    });
  });

  describe('sumLineCents', () => {
    it('sums line totals in integer cents', () => {
      expect(
        sumLineCents([
          { price: '29.99', quantity: 2 },
          { price: { toString: () => '9.99' }, quantity: 1 },
        ]),
      ).toBe(6997);
    });

    it('is 0 for no lines', () => {
      expect(sumLineCents([])).toBe(0);
    });
  });
});
