import { ProductEntity } from './product.entity';

/**
 * TASK-254: ProductEntity gains derived reservedQty/physicalQty. reservedQty is
 * optional on the fromPrisma input (list/detail reads pass the derived aggregate;
 * mutation-echo reads omit it and default to 0), always present on the output.
 * physicalQty = stock + reservedQty (derived arithmetic, never a second query).
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

describe('ProductEntity.fromPrisma — reserved/physical (TASK-254)', () => {
  it('passes reservedQty through and derives physicalQty = stock + reservedQty', () => {
    const entity = ProductEntity.fromPrisma({ ...base, stock: 5, reservedQty: 3 });

    expect(entity.reservedQty).toBe(3);
    expect(entity.physicalQty).toBe(8);
  });

  it('defaults reservedQty to 0 (physicalQty = stock) when the input omits it', () => {
    const entity = ProductEntity.fromPrisma({ ...base, stock: 5 });

    expect(entity.reservedQty).toBe(0);
    expect(entity.physicalQty).toBe(5);
  });
});
