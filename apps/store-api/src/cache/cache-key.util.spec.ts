import {
  buildProductListKey,
  productDetailIdKey,
  productDetailSlugKey,
  PRODUCT_LIST_PREFIX,
  type ProductListKeyParams,
} from './cache-key.util';

describe('cache-key.util', () => {
  describe('buildProductListKey', () => {
    it('always starts with the product:list prefix', () => {
      const key = buildProductListKey({ page: 1, limit: 20 });
      expect(key.startsWith(`${PRODUCT_LIST_PREFIX}:`)).toBe(true);
    });

    it('produces the same key regardless of object construction order', () => {
      const a: ProductListKeyParams = {
        page: 2,
        limit: 10,
        categoryId: 'cat-1',
        search: 'iphone',
        sortBy: 'price',
        sortOrder: 'asc',
      };
      // Same values, different literal key order.
      const b: ProductListKeyParams = {
        sortOrder: 'asc',
        sortBy: 'price',
        search: 'iphone',
        categoryId: 'cat-1',
        limit: 10,
        page: 2,
      };

      expect(buildProductListKey(a)).toBe(buildProductListKey(b));
    });

    it('serializes all params in a fixed, readable order', () => {
      const key = buildProductListKey({
        page: 2,
        limit: 10,
        categoryId: 'cat-1',
        isActive: true,
        minPrice: 10,
        maxPrice: 100,
        search: 'case',
        sortBy: 'price',
        sortOrder: 'asc',
      });

      expect(key).toBe(
        'product:list:page=2|limit=10|categoryId=cat-1|isActive=true|minPrice=10|maxPrice=100|search=case|sortBy=price|sortOrder=asc',
      );
    });

    it('omits undefined/null optional params (no "undefined" literals)', () => {
      const key = buildProductListKey({ page: 1, limit: 20 });

      expect(key).toBe('product:list:page=1|limit=20');
      expect(key).not.toContain('undefined');
      expect(key).not.toContain('null');
    });

    it('treats an empty-string search as absent', () => {
      const withEmpty = buildProductListKey({ page: 1, limit: 20, search: '' });
      const without = buildProductListKey({ page: 1, limit: 20 });

      expect(withEmpty).toBe(without);
      expect(withEmpty).not.toContain('search');
    });

    it('includes isActive=false (a meaningful filter, not omitted)', () => {
      const key = buildProductListKey({ page: 1, limit: 20, isActive: false });
      expect(key).toContain('isActive=false');
    });
  });

  describe('detail key helpers', () => {
    it('builds a slug detail key', () => {
      expect(productDetailSlugKey('iphone-15-case')).toBe('product:detail:slug:iphone-15-case');
    });

    it('builds an id detail key', () => {
      expect(productDetailIdKey('uuid-123')).toBe('product:detail:id:uuid-123');
    });
  });
});
