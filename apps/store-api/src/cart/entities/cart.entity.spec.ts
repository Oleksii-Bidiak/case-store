import { CartEntity } from './cart.entity';

/**
 * Money on the cart (TASK-807). The cart entities used to carry their own copy
 * of the cents arithmetic; they now go through the canonical helpers in
 * `addon-service/money.util.ts`. These cases pin the VALUES the storefront
 * shows, so the switch is provably a no-op for every figure a shopper sees —
 * including the float traps (0.10 × 3, 19.99 × 3) that a naive `price * qty`
 * gets wrong.
 */
function line(id: string, price: string, quantity: number) {
  return {
    id,
    productId: `prod-${id}`,
    quantity,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    product: {
      id: `prod-${id}`,
      name: `Product ${id}`,
      slug: `product-${id}`,
      price: { toString: () => price },
      compareAtPrice: null,
      stock: 50,
      isActive: true,
      category: { isActive: true },
      images: [],
    },
  };
}

function cartOf(items: ReturnType<typeof line>[]) {
  return CartEntity.fromPrisma({
    id: 'cart-1',
    userId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    items,
  });
}

describe('CartEntity money (TASK-807)', () => {
  it.each([
    ['29.99', 2, '59.98'],
    ['0.10', 3, '0.30'],
    ['19.99', 3, '59.97'],
    ['10', 1, '10.00'],
    ['1234.5', 2, '2469.00'],
    ['0.01', 99, '0.99'],
  ])('line total of %s × %i is %s', (price, quantity, expected) => {
    const cart = cartOf([line('a', price, quantity)]);

    expect(cart.items[0].lineTotal).toBe(expected);
    expect(cart.totals.subtotal).toBe(expected);
  });

  it('sums lines in cents: 29.99 × 2 + 9.99 × 1 + 0.10 × 3 = 70.27', () => {
    const cart = cartOf([line('a', '29.99', 2), line('b', '9.99', 1), line('c', '0.10', 3)]);

    expect(cart.totals.subtotal).toBe('70.27');
    expect(cart.totals.itemCount).toBe(6);
    expect(cart.totals.uniqueItems).toBe(3);
  });

  it('an empty cart totals to 0.00', () => {
    const cart = cartOf([]);

    expect(cart.totals.subtotal).toBe('0.00');
    expect(cart.totals.addonsTotal).toBe('0.00');
  });
});
