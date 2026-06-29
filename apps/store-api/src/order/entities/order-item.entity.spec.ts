import { OrderItemEntity } from './order-item.entity';
import type { OrderItemRow } from '../order.types';

/**
 * Build a repository-shaped order item row for the mapper under test. Product
 * overrides are shallow-merged so a test can tweak slug / images in isolation.
 */
function buildOrderItemRow(
  productOverrides: Partial<{
    slug: string;
    images: Array<{ url: string }>;
  }> = {},
): OrderItemRow {
  return {
    id: 'order-item-1',
    orderId: 'order-1',
    productId: 'prod-1',
    quantity: 2,
    price: { toString: () => '29.99' },
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    product: {
      id: 'prod-1',
      name: 'iPhone 15 Pro Case — Clear MagSafe',
      slug: 'iphone-15-pro-case-clear-magsafe',
      images: [{ url: 'https://cdn.example.com/primary.jpg' }],
      ...productOverrides,
    },
  };
}

describe('OrderItemEntity.fromPrisma', () => {
  it('maps product.slug to productSlug', () => {
    const entity = OrderItemEntity.fromPrisma(buildOrderItemRow());

    expect(entity.productSlug).toBe('iphone-15-pro-case-clear-magsafe');
  });

  it('maps the first product image url to imageUrl', () => {
    const entity = OrderItemEntity.fromPrisma(
      buildOrderItemRow({ images: [{ url: 'https://cdn.example.com/primary.jpg' }] }),
    );

    expect(entity.imageUrl).toBe('https://cdn.example.com/primary.jpg');
  });

  it('sets imageUrl to null when the product has no images', () => {
    const entity = OrderItemEntity.fromPrisma(buildOrderItemRow({ images: [] }));

    expect(entity.imageUrl).toBeNull();
  });
});
