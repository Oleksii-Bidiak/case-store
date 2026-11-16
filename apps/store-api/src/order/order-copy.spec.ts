import { OrderStatus } from '@prisma/client';
import { planCopyLines, releasesStockOnCopy, type CopySourceLine } from './order-copy';

/**
 * TASK-2048 «Створити копію» — which lines of the original make it into the copy
 * form, at today's price, and which the operator is warned about.
 */
describe('order-copy', () => {
  const line = (over: Partial<CopySourceLine['product']> = {}, quantity = 2): CopySourceLine => ({
    productId: 'p-1',
    quantity,
    product: {
      id: 'p-1',
      name: 'Чохол',
      sku: 'CASE-1',
      price: { toString: () => '549.00' },
      stock: 10,
      isActive: true,
      deletedAt: null,
      category: { isActive: true, ancestorsActive: true },
      ...over,
    },
  });

  describe('planCopyLines', () => {
    it('copies an available line at the CURRENT catalogue price', () => {
      expect(planCopyLines([line()], { released: new Map() })).toEqual({
        lines: [
          {
            productId: 'p-1',
            productName: 'Чохол',
            sku: 'CASE-1',
            price: '549.00',
            quantity: 2,
            stock: 10,
          },
        ],
        dropped: [],
      });
    });

    it.each<[string, Partial<CopySourceLine['product']>, string]>([
      ['a deleted product', { deletedAt: new Date() }, 'DELETED'],
      ['an inactive product', { isActive: false }, 'INACTIVE'],
      [
        'a product whose category is off sale',
        { category: { isActive: true, ancestorsActive: false } },
        'INACTIVE',
      ],
      ['a product out of stock', { stock: 0 }, 'OUT_OF_STOCK'],
    ])('drops %s and says why', (_label, over, reason) => {
      const plan = planCopyLines([line(over)], { released: new Map() });

      expect(plan.lines).toEqual([]);
      expect(plan.dropped).toEqual([
        { productId: 'p-1', productName: 'Чохол', requested: 2, copied: 0, reason },
      ]);
    });

    it('clamps the quantity to what is on the shelf, and says so', () => {
      const plan = planCopyLines([line({ stock: 1 }, 3)], { released: new Map() });

      expect(plan.lines).toEqual([expect.objectContaining({ quantity: 1, stock: 1 })]);
      expect(plan.dropped).toEqual([
        { productId: 'p-1', productName: 'Чохол', requested: 3, copied: 1, reason: 'CLAMPED' },
      ]);
    });

    it('counts the units the cancel of the original gives back — the last unit moves', () => {
      const plan = planCopyLines([line({ stock: 0 }, 1)], { released: new Map([['p-1', 1]]) });

      expect(plan.lines).toEqual([expect.objectContaining({ quantity: 1, stock: 1 })]);
      expect(plan.dropped).toEqual([]);
    });

    it('shares one product’s stock between two lines of it', () => {
      const plan = planCopyLines([line({ stock: 3 }, 2), line({ stock: 3 }, 2)], {
        released: new Map(),
      });

      expect(plan.lines.map((l) => l.quantity)).toEqual([2, 1]);
      expect(plan.dropped).toEqual([expect.objectContaining({ requested: 2, copied: 1 })]);
    });
  });

  describe('releasesStockOnCopy', () => {
    it.each([OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING])(
      'a %s original that still holds its stock gives it back when cancelled',
      (status) => {
        expect(releasesStockOnCopy({ status, restockedAt: null }, true)).toBe(true);
      },
    );

    it('nothing comes back when the original stays live', () => {
      expect(releasesStockOnCopy({ status: OrderStatus.PENDING, restockedAt: null }, false)).toBe(
        false,
      );
    });

    it('nothing comes back from a hold already released', () => {
      expect(
        releasesStockOnCopy({ status: OrderStatus.PENDING, restockedAt: new Date() }, true),
      ).toBe(false);
    });

    it.each([OrderStatus.SHIPPED, OrderStatus.CANCELLED])(
      'nothing comes back from a %s original',
      (status) => {
        expect(releasesStockOnCopy({ status, restockedAt: null }, true)).toBe(false);
      },
    );
  });
});
