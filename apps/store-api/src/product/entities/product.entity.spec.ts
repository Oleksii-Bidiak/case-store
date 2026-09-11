import { ProductEntity } from './product.entity';

/**
 * TASK-254 introduced the derived `reservedQty`/`physicalQty` pair;
 * TASK-408 made `reservedQty` a REQUIRED input.
 *
 * The original contract let callers omit it and defaulted to 0, which is how the
 * seven mutation-echo paths in `ProductService` ended up reporting
 * `physicalQty === stock` — i.e. "nothing is reserved" — for a product that had
 * units sitting in unshipped orders. The default WAS the bug, so the test that
 * pinned the default is gone: the type now forces every caller to pass the real
 * aggregate, and the arithmetic below is all the entity is allowed to do.
 */
const base = {
  id: 'p1',
  name: 'Clear Case',
  slug: 'clear-case',
  description: null,
  price: { toString: () => '29.99' },
  compareAtPrice: null,
  sku: null,
  categoryId: 'cat-1',
  isActive: true,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
};

describe('ProductEntity.fromPrisma — reserved/physical (TASK-254, TASK-408)', () => {
  it('passes reservedQty through and derives physicalQty = stock + reservedQty', () => {
    const entity = ProductEntity.fromPrisma({ ...base, stock: 5, reservedQty: 3 });

    expect(entity.reservedQty).toBe(3);
    expect(entity.physicalQty).toBe(8);
  });

  it('reports physicalQty = stock only when nothing is actually reserved', () => {
    const entity = ProductEntity.fromPrisma({ ...base, stock: 5, reservedQty: 0 });

    expect(entity.reservedQty).toBe(0);
    expect(entity.physicalQty).toBe(5);
  });

  // The zero default is what made every mutation echo lie, so it must not come
  // back through the door it left by. Omitting `reservedQty` is a compile error
  // now; a caller who forces one through anyway must NOT be quietly rewritten to
  // 0 — `physicalQty` goes NaN instead, which is the loud failure we want rather
  // than a plausible-looking wrong number an operator would act on.
  it('never invents a reservedQty of its own when the field is missing', () => {
    const entity = ProductEntity.fromPrisma({ ...base, stock: 5 } as unknown as Parameters<
      typeof ProductEntity.fromPrisma
    >[0]);

    expect(entity.reservedQty).toBeUndefined();
    expect(entity.physicalQty).toBeNaN();
  });
});
