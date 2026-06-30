import {
  ProductVariantSummaryEntity,
  type VariantSiblingInput,
} from './product-variant-summary.entity';

/** Build a sibling position with sensible defaults for the summary under test. */
function sibling(overrides: Partial<VariantSiblingInput> = {}): VariantSiblingInput {
  return {
    id: 'pos-1',
    slug: 'usb-c-cable-1m',
    price: { toString: () => '12.99' },
    attributes: { color: 'Black' },
    stock: 10,
    positionOrder: 0,
    ...overrides,
  };
}

describe('ProductVariantSummaryEntity.fromSiblings', () => {
  it('picks the cheapest position as the default (advertised) variant', () => {
    const summary = ProductVariantSummaryEntity.fromSiblings('grp-1', [
      sibling({ id: 'a', slug: 'a', price: { toString: () => '19.99' }, positionOrder: 0 }),
      sibling({ id: 'b', slug: 'b', price: { toString: () => '9.99' }, positionOrder: 1 }),
      sibling({ id: 'c', slug: 'c', price: { toString: () => '14.99' }, positionOrder: 2 }),
    ]);

    expect(summary.priceFrom).toBe('9.99');
    expect(summary.defaultVariantId).toBe('b');
    expect(summary.defaultVariantSlug).toBe('b');
    expect(summary.variantCount).toBe(3);
    expect(summary.groupId).toBe('grp-1');
  });

  it('collects distinct colours in positionOrder, with a representative per colour', () => {
    const summary = ProductVariantSummaryEntity.fromSiblings('grp-1', [
      sibling({ id: 'a', attributes: { color: 'Black' }, positionOrder: 1, stock: 0 }),
      sibling({ id: 'b', attributes: { color: 'White' }, positionOrder: 0, stock: 4 }),
      sibling({ id: 'c', attributes: { color: 'Black' }, positionOrder: 2, stock: 7 }),
    ]);

    expect(summary.colors.map((c) => c.value)).toEqual(['White', 'Black']);
    const black = summary.colors.find((c) => c.value === 'Black');
    // First Black by positionOrder is id 'a' (order 1), which is out of stock.
    expect(black?.productId).toBe('a');
    expect(black?.inStock).toBe(false);
  });

  it('reads the colour axis case-insensitively and ignores empty/non-string values', () => {
    const summary = ProductVariantSummaryEntity.fromSiblings('grp-1', [
      sibling({ id: 'a', attributes: { Color: 'Red', pack: 'single' } }),
      sibling({ id: 'b', attributes: { color: '' } }),
      sibling({ id: 'c', attributes: { length: '1m' } }),
    ]);

    expect(summary.colors).toHaveLength(1);
    expect(summary.colors[0].value).toBe('Red');
  });

  it('reports defaultInStock based on the cheapest position stock', () => {
    const summary = ProductVariantSummaryEntity.fromSiblings('grp-1', [
      sibling({ id: 'a', price: { toString: () => '5.00' }, stock: 0 }),
      sibling({ id: 'b', price: { toString: () => '6.00' }, stock: 3 }),
    ]);

    expect(summary.defaultVariantId).toBe('a');
    expect(summary.defaultInStock).toBe(false);
  });

  it('collapses a standalone product to a single variant', () => {
    const summary = ProductVariantSummaryEntity.fromSiblings(null, [
      sibling({ id: 'solo', slug: 'solo', attributes: {}, stock: 2 }),
    ]);

    expect(summary.groupId).toBeNull();
    expect(summary.variantCount).toBe(1);
    expect(summary.defaultVariantId).toBe('solo');
    expect(summary.colors).toEqual([]);
  });
});
