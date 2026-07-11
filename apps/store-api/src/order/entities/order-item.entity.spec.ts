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

  // ─── Add-on snapshots (TASK-174, plan 150 case 23) ─────────────────────────

  describe('add-on snapshots', () => {
    it('reads name/price straight off the FROZEN row — no live catalog join', () => {
      const row = buildOrderItemRow();

      const entity = OrderItemEntity.fromPrisma({
        ...row,
        addons: [
          {
            id: 'oia-1',
            addonServiceId: 'svc-insurance',
            // The catalog has since been repriced and the service renamed — the
            // order must still report what the customer actually bought.
            name: 'Insurance (as sold)',
            price: { toString: () => '1299' },
          },
        ],
      });

      expect(entity.addons).toEqual([
        {
          id: 'oia-1',
          addonServiceId: 'svc-insurance',
          name: 'Insurance (as sold)',
          price: '1299.00', // padded, never re-derived from the catalog
        },
      ]);
    });

    it('leaves add-ons out of lineTotal (they are reported as the order-level addonsTotal)', () => {
      const row = buildOrderItemRow();

      const entity = OrderItemEntity.fromPrisma({
        ...row,
        addons: [
          { id: 'oia-1', addonServiceId: 'svc-a', name: 'A', price: { toString: () => '499' } },
        ],
      });

      // 29.99 × 2 — exactly as if no add-on had been bought.
      expect(entity.lineTotal).toBe('59.98');
    });

    it('yields an empty array for a line with no add-ons', () => {
      expect(OrderItemEntity.fromPrisma(buildOrderItemRow()).addons).toEqual([]);
    });
  });
});
