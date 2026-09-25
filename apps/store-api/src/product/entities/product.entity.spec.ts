import { ProductEntity } from './product.entity';
import { PublicProductEntity } from './public-product.entity';

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

/**
 * TASK-814: the admin and the public entity used to declare their `fromPrisma`
 * input and copy the shared fields each on its own — and the two copies had
 * already drifted (the admin one did not accept `primaryImage.blurDataUrl`). One
 * shared source type and one shared mapper now serve both; this pins that the
 * same row yields the same shared fields from either side.
 */
describe('ProductEntity and PublicProductEntity shared fields (TASK-814)', () => {
  const row = {
    ...base,
    description: 'Clear case',
    compareAtPrice: { toString: () => '39.99' },
    sku: 'SKU-1',
    stock: 7,
    reservedQty: 2,
    groupId: 'grp-1',
    brand: { id: 'b1', name: 'Spigen', slug: 'spigen', logo: null },
    attributes: { color: 'blue' },
    positionOrder: 3,
    metaTitle: 'Meta',
    metaDescription: 'Meta description',
    keywords: ['magsafe'],
    ogImage: 'https://cdn.example.com/og.jpg',
    ratingAverage: 4.26,
    ratingCount: 9,
    primaryImage: {
      id: 'img-1',
      url: 'https://cdn.example.com/1.jpg',
      alt: 'Front',
      blurDataUrl: 'data:image/webp;base64,AAAA',
      sortOrder: 0,
      isPrimary: true,
    },
    compatibleDeviceModels: [
      { id: 'd1', name: 'iPhone 15', slug: 'iphone-15', brandName: 'Apple' },
    ],
  };

  it('accepts and keeps the primary image blur placeholder on the admin entity', () => {
    const entity = ProductEntity.fromPrisma(row);

    expect(entity.primaryImage?.blurDataUrl).toBe('data:image/webp;base64,AAAA');
  });

  it('maps every shared field identically on both entities', () => {
    const admin = ProductEntity.fromPrisma(row);
    const pub = PublicProductEntity.fromPrisma(row);

    const { stock, reservedQty, physicalQty, ...adminShared } = admin;
    const { inStock, lowStock, variantSummary, ...publicShared } = pub;

    expect([stock, reservedQty, physicalQty]).toEqual([7, 2, 9]);
    expect([inStock, lowStock, variantSummary.defaultVariantId]).toEqual([true, false, 'p1']);
    expect({ ...publicShared }).toEqual({ ...adminShared });
    expect(adminShared.ratingAverage).toBe(4.3);
  });
});
