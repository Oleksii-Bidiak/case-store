import { PublicProductEntity } from './public-product.entity';
import { LOW_STOCK_THRESHOLD } from '../product.constants';

/**
 * Build a Prisma-shaped product row for the public mapper under test. The shape
 * mirrors `ProductEntity.fromPrisma` (including the raw `stock`), since
 * `PublicProductEntity.fromPrisma` accepts the same input and derives the
 * public availability signals from it.
 */
function buildPrismaProduct(
  overrides: Partial<{
    stock: number;
    ratingAverage: number | null;
    primaryImage: {
      id: string;
      url: string;
      alt: string | null;
      sortOrder: number;
      isPrimary: boolean;
    } | null;
  }> = {},
) {
  return {
    id: 'prod-1',
    name: 'iPhone 15 Pro Case — Clear MagSafe',
    slug: 'iphone-15-pro-case-clear-magsafe',
    description: 'Premium clear case',
    price: { toString: () => '29.99' },
    compareAtPrice: { toString: () => '39.99' },
    sku: 'IP15-PRO-CASE-CLR',
    stock: 10,
    categoryId: 'cat-1',
    groupId: null,
    attributes: {},
    positionOrder: 0,
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
    ratingAverage: 4.5,
    ratingCount: 12,
    primaryImage: null,
    ...overrides,
  };
}

describe('PublicProductEntity.fromPrisma', () => {
  it('reports out of stock when stock is 0', () => {
    const entity = PublicProductEntity.fromPrisma(buildPrismaProduct({ stock: 0 }));

    expect(entity.inStock).toBe(false);
    expect(entity.lowStock).toBe(false);
  });

  it('reports low stock when 0 < stock <= LOW_STOCK_THRESHOLD', () => {
    const entity = PublicProductEntity.fromPrisma(buildPrismaProduct({ stock: 3 }));

    expect(LOW_STOCK_THRESHOLD).toBe(5);
    expect(entity.inStock).toBe(true);
    expect(entity.lowStock).toBe(true);
  });

  it('reports in stock (not low) when stock exceeds the threshold', () => {
    const entity = PublicProductEntity.fromPrisma(buildPrismaProduct({ stock: 6 }));

    expect(entity.inStock).toBe(true);
    expect(entity.lowStock).toBe(false);
  });

  it('never exposes the raw stock value on the entity', () => {
    const entity = PublicProductEntity.fromPrisma(buildPrismaProduct({ stock: 42 }));

    expect('stock' in entity).toBe(false);
    expect((entity as Record<string, unknown>).stock).toBeUndefined();
  });

  it('rounds ratingAverage to one decimal place', () => {
    const entity = PublicProductEntity.fromPrisma(buildPrismaProduct({ ratingAverage: 4.26 }));

    expect(entity.ratingAverage).toBe(4.3);
  });

  it('maps primaryImage via ProductImageEntity when present', () => {
    const entity = PublicProductEntity.fromPrisma(
      buildPrismaProduct({
        primaryImage: {
          id: 'img-1',
          url: 'https://cdn.example.com/primary.jpg',
          alt: 'cover',
          sortOrder: 0,
          isPrimary: true,
        },
      }),
    );

    expect(entity.primaryImage).not.toBeNull();
    expect(entity.primaryImage?.url).toBe('https://cdn.example.com/primary.jpg');
  });

  it('sets primaryImage to null when absent', () => {
    const entity = PublicProductEntity.fromPrisma(buildPrismaProduct({ primaryImage: null }));

    expect(entity.primaryImage).toBeNull();
  });
});
