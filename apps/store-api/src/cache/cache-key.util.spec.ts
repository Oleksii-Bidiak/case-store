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
        onSale: true,
        sortBy: 'price',
        sortOrder: 'asc',
      });

      expect(key).toBe(
        'product:list:page=2|limit=10|categoryId=cat-1|isActive=true|minPrice=10|maxPrice=100|search=case|onSale=true|sortBy=price|sortOrder=asc',
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

    it('keys onSale=true distinctly from onSale absent (no silent collision)', () => {
      const withFilter = buildProductListKey({ page: 1, limit: 20, onSale: true });
      const without = buildProductListKey({ page: 1, limit: 20 });

      expect(withFilter).toContain('onSale=true');
      expect(withFilter).not.toBe(without);
    });

    it('includes onSale=false (a meaningful filter, not omitted)', () => {
      const key = buildProductListKey({ page: 1, limit: 20, onSale: false });
      expect(key).toContain('onSale=false');
    });

    // The builder's own promise is "two structurally identical queries map to
    // one key". Its converse is the one that matters for correctness, and only
    // these two fields carry shopper-supplied text: a `|` inside `search` or a
    // spec value used to forge every segment serialized after it, so an empty
    // page could be written into the entry a real filtered query reads back.
    it('cannot forge a later segment through a pipe in search', () => {
      const forged = buildProductListKey({ page: 1, limit: 20, search: 'чохол|inStock=true' });
      const real = buildProductListKey({ page: 1, limit: 20, search: 'чохол', inStock: true });

      expect(forged).not.toBe(real);
      expect(real).toContain('inStock=true');
      expect(forged).not.toContain('|inStock=true');
    });

    it('cannot forge a later segment through a pipe in a spec value', () => {
      const forged = buildProductListKey({
        page: 1,
        limit: 20,
        specs: 'ratio:16|inStock=true',
      });
      const real = buildProductListKey({ page: 1, limit: 20, specs: 'ratio:16', inStock: true });

      expect(forged).not.toBe(real);
      expect(forged).not.toContain('|inStock=true');
    });

    it('keeps the escape injective — a literal percent cannot spell an escaped pipe', () => {
      const escaped = buildProductListKey({ page: 1, limit: 20, search: 'a|b' });
      const literal = buildProductListKey({ page: 1, limit: 20, search: 'a%7Cb' });

      expect(escaped).not.toBe(literal);
    });

    it('leaves an ordinary Cyrillic search readable in the key', () => {
      const key = buildProductListKey({ page: 1, limit: 20, search: 'чохол' });
      expect(key).toContain('search=чохол');
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
