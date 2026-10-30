import {
  isCategoryOnSale,
  isPubliclyVisible,
  PUBLIC_PRODUCT_WHERE,
  publicProductSql,
} from './product-visibility';

describe('publicProductSql — the SQL twin of the predicate (TASK-711)', () => {
  it('spells every half of PUBLIC_PRODUCT_WHERE against the given aliases', () => {
    const sql = publicProductSql({ product: 'p', category: 'c' });

    // The category half carries ALL its nested keys (TASK-653, TASK-1032) — the
    // mapped-type guard only sees top-level keys, so this string is what pins them.
    expect(sql.sql).toBe(
      'p.is_active = true AND p.deleted_at IS NULL AND ' +
        'c.is_active = true AND c.deleted_at IS NULL AND c.ancestors_active = true',
    );
    // No bound values: the fragment is pure column logic, so it composes into
    // any aggregate without shifting the caller's parameter numbering.
    expect(sql.values).toEqual([]);
  });

  it('refuses an alias that is not a plain SQL identifier', () => {
    // The aliases are spliced raw — a non-identifier is a bug at the call site,
    // never something to quote around.
    expect(() => publicProductSql({ product: 'p; DROP TABLE products', category: 'c' })).toThrow();
    expect(() => publicProductSql({ product: 'p', category: '"c"' })).toThrow();
  });
});

describe('product visibility predicate (TASK-781)', () => {
  it('requires an active, non-deleted product in an active, non-deleted category on a visible branch', () => {
    expect(PUBLIC_PRODUCT_WHERE).toEqual({
      isActive: true,
      deletedAt: null,
      category: { isActive: true, deletedAt: null, ancestorsActive: true },
    });
  });

  describe('isCategoryOnSale (TASK-1032)', () => {
    it('accepts an active category on a visible branch', () => {
      expect(isCategoryOnSale({ isActive: true, ancestorsActive: true })).toBe(true);
    });

    it('rejects an inactive category', () => {
      expect(isCategoryOnSale({ isActive: false, ancestorsActive: true })).toBe(false);
    });

    it('rejects an active category under an inactive ancestor — the cascade', () => {
      expect(isCategoryOnSale({ isActive: true, ancestorsActive: false })).toBe(false);
    });
  });

  describe('isPubliclyVisible', () => {
    const visible = {
      isActive: true,
      deletedAt: null,
      category: { isActive: true, ancestorsActive: true },
    };

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
      expect(
        isPubliclyVisible({ ...visible, category: { isActive: false, ancestorsActive: true } }),
      ).toBe(false);
    });

    // TASK-1032: deactivating an ancestor withdraws the whole branch, at any depth.
    it('rejects a product whose category sits under an inactive ancestor', () => {
      expect(
        isPubliclyVisible({ ...visible, category: { isActive: true, ancestorsActive: false } }),
      ).toBe(false);
    });

    // TASK-653: parity with the Prisma rule, for a caller that loads the tombstone column.
    it('rejects a product whose category is deleted', () => {
      expect(
        isPubliclyVisible({
          ...visible,
          category: { isActive: true, ancestorsActive: true, deletedAt: new Date() },
        }),
      ).toBe(false);
      expect(
        isPubliclyVisible({
          ...visible,
          category: { isActive: true, ancestorsActive: true, deletedAt: null },
        }),
      ).toBe(true);
    });

    it('rejects a product whose category was not loaded', () => {
      expect(isPubliclyVisible({ isActive: true, deletedAt: null })).toBe(false);
      expect(isPubliclyVisible({ isActive: true, deletedAt: null, category: null })).toBe(false);
    });
  });
});
