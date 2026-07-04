import { CartItemEntity } from './cart-item.entity';

/**
 * Build a Prisma-shaped cart item row for the mapper under test. Overrides are
 * shallow-merged into the `product` sub-object so individual tests can tweak the
 * slug / images without restating the whole fixture.
 */
function buildPrismaCartItem(
  productOverrides: Partial<{
    slug: string;
    images: Array<{ url: string }>;
    stock: number;
  }> = {},
) {
  return {
    id: 'item-1',
    productId: 'prod-1',
    quantity: 2,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
    product: {
      id: 'prod-1',
      name: 'iPhone 15 Pro Case — Clear MagSafe',
      slug: 'iphone-15-pro-case-clear-magsafe',
      price: { toString: () => '29.99' },
      compareAtPrice: { toString: () => '39.99' },
      stock: 50,
      isActive: true,
      images: [{ url: 'https://cdn.example.com/primary.jpg' }],
      ...productOverrides,
    },
  };
}

describe('CartItemEntity.fromPrisma', () => {
  it('maps product.slug to productSlug', () => {
    const entity = CartItemEntity.fromPrisma(buildPrismaCartItem());

    expect(entity.productSlug).toBe('iphone-15-pro-case-clear-magsafe');
  });

  it('maps the first product image url to imageUrl', () => {
    const entity = CartItemEntity.fromPrisma(
      buildPrismaCartItem({ images: [{ url: 'https://cdn.example.com/primary.jpg' }] }),
    );

    expect(entity.imageUrl).toBe('https://cdn.example.com/primary.jpg');
  });

  it('sets imageUrl to null when the product has no images', () => {
    const entity = CartItemEntity.fromPrisma(buildPrismaCartItem({ images: [] }));

    expect(entity.imageUrl).toBeNull();
  });

  // ─── maxQty replaces raw stock in the public contract (TASK-205) ──────────
  it('exposes maxQty equal to stock when below the per-item cap', () => {
    const entity = CartItemEntity.fromPrisma(buildPrismaCartItem({ stock: 50 }));

    expect(entity.maxQty).toBe(50);
  });

  it('caps maxQty at MAX_QUANTITY when stock exceeds it', () => {
    const entity = CartItemEntity.fromPrisma(buildPrismaCartItem({ stock: 500 }));

    expect(entity.maxQty).toBe(99);
  });

  it('sets maxQty to 0 for an out-of-stock position', () => {
    const entity = CartItemEntity.fromPrisma(buildPrismaCartItem({ stock: 0 }));

    expect(entity.maxQty).toBe(0);
  });

  it('does not expose the raw stock figure', () => {
    const entity = CartItemEntity.fromPrisma(buildPrismaCartItem({ stock: 500 }));

    expect(entity).not.toHaveProperty('stock');
  });
});
