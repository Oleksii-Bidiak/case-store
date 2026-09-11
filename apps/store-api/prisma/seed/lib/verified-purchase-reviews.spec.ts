import { cataloguePositions } from '../data/catalogue';
import { orderSpecs } from '../data/orders.data';
import type { OrderSpec } from '../types';
import { buildVerifiedPurchaseReviews } from './verified-purchase-reviews';

/**
 * TASK-409 — the «Підтверджена покупка» badge was invisible on the whole demo.
 *
 * The badge is computed, not stored: `ReviewRepository` asks whether the review's
 * AUTHOR has an order line for that product. The seed wrote every review from a
 * `reviewerN@store.com` account and every order from a customer account, so the
 * join could not match for any review of any product. These tests assert the
 * property that was missing — a review whose author really did buy the thing —
 * against the seed's own data, without a database.
 */

const spec = (overrides: Partial<OrderSpec> = {}): OrderSpec => ({
  key: 'k',
  email: 'buyer@example.com',
  status: 'DELIVERED',
  paymentStatus: 'PAID',
  statusFlow: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'],
  paymentFlow: ['PENDING', 'PAID'],
  items: [{ sku: 'SKU-1', quantity: 1 }],
  daysAgo: 5,
  city: 'Київ',
  warehouse: 'Відділення №1',
  ...overrides,
});

describe('buildVerifiedPurchaseReviews', () => {
  it('writes the review from the account that placed the order, about a line it contained', () => {
    const reviews = buildVerifiedPurchaseReviews([
      spec({
        email: 'dmytro@example.com',
        items: [
          { sku: 'SKU-1', quantity: 1 },
          { sku: 'SKU-2', quantity: 2 },
        ],
      }),
    ]);

    expect(reviews).toHaveLength(2);
    for (const review of reviews) {
      expect(review.email).toBe('dmytro@example.com');
      expect(['SKU-1', 'SKU-2']).toContain(review.sku);
      expect(review.comment.length).toBeGreaterThan(0);
      expect(review.rating).toBeGreaterThanOrEqual(4);
      expect(review.rating).toBeLessThanOrEqual(5);
    }
  });

  it('reviews only what was delivered — never a pending, cancelled or refunded order', () => {
    const reviews = buildVerifiedPurchaseReviews([
      spec({ key: 'pending', status: 'PENDING', items: [{ sku: 'NOPE-1', quantity: 1 }] }),
      spec({ key: 'shipped', status: 'SHIPPED', items: [{ sku: 'NOPE-2', quantity: 1 }] }),
      spec({ key: 'cancelled', status: 'CANCELLED', items: [{ sku: 'NOPE-3', quantity: 1 }] }),
      // Delivered, then sent back: the buyer is not endorsing it.
      spec({
        key: 'refunded',
        status: 'REFUNDED',
        statusFlow: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'REFUNDED'],
        items: [{ sku: 'NOPE-4', quantity: 1 }],
      }),
      spec({ key: 'delivered', items: [{ sku: 'YES-1', quantity: 1 }] }),
    ]);

    expect(reviews.map((r) => r.sku)).toEqual(['YES-1']);
  });

  it('emits one review per (buyer, position) — the Review table is unique on that pair', () => {
    const reviews = buildVerifiedPurchaseReviews([
      spec({ key: 'a', items: [{ sku: 'SKU-1', quantity: 1 }] }),
      spec({ key: 'b', items: [{ sku: 'SKU-1', quantity: 3 }] }),
    ]);

    expect(reviews).toHaveLength(1);
  });

  it('is deterministic — re-seeding never reshuffles ratings or comments', () => {
    expect(buildVerifiedPurchaseReviews(orderSpecs)).toEqual(
      buildVerifiedPurchaseReviews(orderSpecs),
    );
  });
});

describe('the seeded catalogue actually produces a badge (TASK-409 regression)', () => {
  const reviews = buildVerifiedPurchaseReviews(orderSpecs);

  it('derives at least one verified-purchase review from the real order data', () => {
    expect(reviews.length).toBeGreaterThan(0);
  });

  it('names only SKUs the catalogue creates, so the seeder can resolve every one', () => {
    const catalogueSkus = new Set(cataloguePositions().map((p) => p.sku));
    const unknown = reviews.map((r) => r.sku).filter((sku) => !catalogueSkus.has(sku));

    expect(unknown).toEqual([]);
  });

  it('names only buyers that the same orders were placed by', () => {
    const orderEmails = new Set(orderSpecs.map((s) => s.email));
    const unknown = reviews.map((r) => r.email).filter((email) => !orderEmails.has(email));

    expect(unknown).toEqual([]);
  });

  it('pairs each review with a product that buyer really ordered — the join the badge runs', () => {
    // The predicate `ReviewRepository.findVerifiedPurchaserIds` evaluates:
    // an order of this user's containing this product.
    const purchases = new Set(
      orderSpecs.flatMap((s) => s.items.map((item) => `${s.email}:${item.sku}`)),
    );

    for (const review of reviews) {
      expect(purchases.has(`${review.email}:${review.sku}`)).toBe(true);
    }
  });
});
