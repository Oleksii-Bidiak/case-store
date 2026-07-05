import { WishlistItemEntity } from './wishlist-item.entity';

/**
 * Build a Prisma-shaped wishlist item row for the mapper under test. Overrides
 * are shallow-merged into the `product` sub-object so individual tests can
 * tweak the stock / images without restating the whole fixture.
 */
function buildPrismaWishlistItem(
  productOverrides: Partial<{
    slug: string;
    images: Array<{ url: string }>;
    stock: number;
  }> = {},
) {
  return {
    id: 'item-1',
    productId: 'prod-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
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

describe('WishlistItemEntity.fromPrisma', () => {
  it('maps product summary fields (name, slug, price, compareAtPrice)', () => {
    const entity = WishlistItemEntity.fromPrisma(buildPrismaWishlistItem());

    expect(entity.productName).toBe('iPhone 15 Pro Case — Clear MagSafe');
    expect(entity.productSlug).toBe('iphone-15-pro-case-clear-magsafe');
    expect(entity.price).toBe('29.99');
    expect(entity.compareAtPrice).toBe('39.99');
  });

  it('maps the first product image url to imageUrl', () => {
    const entity = WishlistItemEntity.fromPrisma(
      buildPrismaWishlistItem({ images: [{ url: 'https://cdn.example.com/primary.jpg' }] }),
    );

    expect(entity.imageUrl).toBe('https://cdn.example.com/primary.jpg');
  });

  it('sets imageUrl to null when the product has no images', () => {
    const entity = WishlistItemEntity.fromPrisma(buildPrismaWishlistItem({ images: [] }));

    expect(entity.imageUrl).toBeNull();
  });

  // ─── maxQty replaces raw stock in the public contract (TASK-231) ──────────
  it('exposes maxQty equal to stock when below the per-item cap', () => {
    const entity = WishlistItemEntity.fromPrisma(buildPrismaWishlistItem({ stock: 50 }));

    expect(entity.maxQty).toBe(50);
  });

  it('caps maxQty at MAX_QUANTITY when stock exceeds it', () => {
    const entity = WishlistItemEntity.fromPrisma(buildPrismaWishlistItem({ stock: 500 }));

    expect(entity.maxQty).toBe(99);
  });

  it('sets maxQty to 0 for an out-of-stock position', () => {
    const entity = WishlistItemEntity.fromPrisma(buildPrismaWishlistItem({ stock: 0 }));

    expect(entity.maxQty).toBe(0);
  });

  it('does not expose the raw stock figure', () => {
    const entity = WishlistItemEntity.fromPrisma(buildPrismaWishlistItem({ stock: 500 }));

    expect(entity).not.toHaveProperty('stock');
  });
});
