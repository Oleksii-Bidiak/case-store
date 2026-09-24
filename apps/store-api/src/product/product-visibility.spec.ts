import { isPubliclyVisible, PUBLIC_PRODUCT_WHERE } from './product-visibility';

describe('product visibility predicate (TASK-781)', () => {
  it('requires an active, non-deleted product in an active category', () => {
    expect(PUBLIC_PRODUCT_WHERE).toEqual({
      isActive: true,
      deletedAt: null,
      category: { isActive: true },
    });
  });

  describe('isPubliclyVisible', () => {
    const visible = { isActive: true, deletedAt: null, category: { isActive: true } };

    it('accepts a product on sale in an active category', () => {
      expect(isPubliclyVisible(visible)).toBe(true);
    });

    it('rejects an inactive product (draft or withdrawn)', () => {
      expect(isPubliclyVisible({ ...visible, isActive: false })).toBe(false);
    });

    it('rejects a soft-deleted product', () => {
      expect(isPubliclyVisible({ ...visible, deletedAt: new Date() })).toBe(false);
    });

    it('rejects a product whose category is inactive', () => {
      expect(isPubliclyVisible({ ...visible, category: { isActive: false } })).toBe(false);
    });

    it('rejects a product whose category was not loaded', () => {
      expect(isPubliclyVisible({ isActive: true, deletedAt: null })).toBe(false);
      expect(isPubliclyVisible({ isActive: true, deletedAt: null, category: null })).toBe(false);
    });
  });
});
