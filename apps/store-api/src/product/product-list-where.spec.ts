import { AttributeType } from '@prisma/client';
import { FACETABLE_TYPES } from '../attribute-definition/attribute-definition.constants';
import { buildProductListWhere } from './product-list-where';
import { PUBLIC_PRODUCT_WHERE } from './product-visibility';

/**
 * Direct unit coverage of the ONE listing `where` builder (TASK-712).
 *
 * `buildProductListWhere` is shared by the storefront listing, the facet
 * counters and the compat landing pages, but until this spec it was covered
 * only indirectly — through repository specs that mock Prisma and three
 * int-specs that need a database. The shape of `where` for the simple filters
 * is a pure function of the params, so it is pinned here without either.
 */
describe('buildProductListWhere', () => {
  describe('visibility', () => {
    it('composes the public branch from PUBLIC_PRODUCT_WHERE (single source)', () => {
      const where = buildProductListWhere({ isActive: true, categoryActiveOnly: true });

      expect(where).toEqual(PUBLIC_PRODUCT_WHERE);
    });

    it('reads the public predicate from product-visibility rather than restating it', () => {
      // Equality above would also hold for a second, hand-spelled copy of the
      // rule — the drift TASK-781 removed. A sentinel on the shared constant
      // proves the builder actually takes its public branch from there.
      jest.isolateModules(() => {
        jest.doMock('./product-visibility', () => ({
          PUBLIC_PRODUCT_WHERE: {
            isActive: true,
            deletedAt: null,
            category: { isActive: true, sentinel: 'from-shared-constant' },
          },
        }));
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const isolated = require('./product-list-where') as typeof import('./product-list-where');

        const where = isolated.buildProductListWhere({ isActive: true, categoryActiveOnly: true });

        expect(where.category).toEqual({ isActive: true, sentinel: 'from-shared-constant' });
      });
    });

    it('does not share the PUBLIC_PRODUCT_WHERE object — a caller mutation cannot leak into it', () => {
      const where = buildProductListWhere({ isActive: true, categoryActiveOnly: true });

      expect(where).not.toBe(PUBLIC_PRODUCT_WHERE);
      expect(where.category).not.toBe(PUBLIC_PRODUCT_WHERE.category);
    });

    it('keeps the public predicate even with deleted: false spelled out', () => {
      const where = buildProductListWhere({
        isActive: true,
        categoryActiveOnly: true,
        deleted: false,
      });

      expect(where).toEqual(PUBLIC_PRODUCT_WHERE);
    });

    it('lists live products only by default (admin, no flags)', () => {
      expect(buildProductListWhere({})).toEqual({ deletedAt: null });
    });

    it('inverts the tombstone filter when deleted is set (admin «Лише видалені»)', () => {
      expect(buildProductListWhere({ deleted: true })).toEqual({ deletedAt: { not: null } });
    });

    it('never combines the public predicate with the deleted toggle', () => {
      const where = buildProductListWhere({
        isActive: true,
        categoryActiveOnly: true,
        deleted: true,
      });

      expect(where.deletedAt).toEqual({ not: null });
    });

    it('applies isActive as sent when it is not the public scope', () => {
      expect(buildProductListWhere({ isActive: false })).toEqual({
        deletedAt: null,
        isActive: false,
      });
      expect(buildProductListWhere({ isActive: true })).toEqual({
        deletedAt: null,
        isActive: true,
      });
    });

    it('joins on category.isActive only when categoryActiveOnly is set', () => {
      expect(buildProductListWhere({ categoryActiveOnly: true })).toEqual({
        deletedAt: null,
        category: { isActive: true },
      });
      expect(buildProductListWhere({ categoryActiveOnly: false })).not.toHaveProperty('category');
    });
  });

  describe('narrowing filters', () => {
    it('builds a gte/lte price range from either bound', () => {
      expect(buildProductListWhere({ minPrice: 100 }).price).toEqual({ gte: 100 });
      expect(buildProductListWhere({ maxPrice: 500 }).price).toEqual({ lte: 500 });
      expect(buildProductListWhere({ minPrice: 100, maxPrice: 500 }).price).toEqual({
        gte: 100,
        lte: 500,
      });
      expect(buildProductListWhere({})).not.toHaveProperty('price');
    });

    it('keeps a zero price bound (0 is a bound, not "absent")', () => {
      expect(buildProductListWhere({ minPrice: 0 }).price).toEqual({ gte: 0 });
    });

    it('searches name and description case-insensitively, never the sku by default', () => {
      expect(buildProductListWhere({ search: 'чохол' }).OR).toEqual([
        { name: { contains: 'чохол', mode: 'insensitive' } },
        { description: { contains: 'чохол', mode: 'insensitive' } },
      ]);
    });

    it('adds the sku to the search only on the admin flag', () => {
      expect(buildProductListWhere({ search: 'IP15', searchIncludesSku: true }).OR).toContainEqual({
        sku: { contains: 'IP15', mode: 'insensitive' },
      });
    });

    it('ignores an empty search string', () => {
      expect(buildProductListWhere({ search: '' })).not.toHaveProperty('OR');
    });

    it('rolls a category subtree up with IN and composes brand and device', () => {
      const where = buildProductListWhere({
        categoryIds: ['root', 'child'],
        brandId: 'brand-1',
        deviceModelId: 'model-1',
      });

      expect(where).toEqual({
        deletedAt: null,
        categoryId: { in: ['root', 'child'] },
        brandId: 'brand-1',
        deviceCompat: { some: { deviceModelId: 'model-1' } },
      });
    });

    it('keeps an EMPTY category id set as an empty IN (an empty slice, not the whole catalogue)', () => {
      expect(buildProductListWhere({ categoryIds: [] }).categoryId).toEqual({ in: [] });
    });

    it('filters stock for inStock and lets outOfStock win when both are sent', () => {
      expect(buildProductListWhere({ inStock: true }).stock).toEqual({ gt: 0 });
      expect(buildProductListWhere({ outOfStock: true }).stock).toEqual({ lte: 0 });
      expect(buildProductListWhere({ inStock: true, outOfStock: true }).stock).toEqual({ lte: 0 });
      expect(buildProductListWhere({ inStock: false })).not.toHaveProperty('stock');
    });

    it('narrows on-sale to the pre-resolved ids, and to nothing when none were resolved', () => {
      expect(buildProductListWhere({ onSale: true }, ['p1', 'p2']).id).toEqual({
        in: ['p1', 'p2'],
      });
      expect(buildProductListWhere({ onSale: true }).id).toEqual({ in: [] });
      expect(buildProductListWhere({ onSale: false }, ['p1'])).not.toHaveProperty('id');
    });
  });

  describe('spec facets', () => {
    it('builds one AND entry per facet with its values OR-ed inside', () => {
      const where = buildProductListWhere({
        specFilters: [
          { key: 'material', values: ['Силікон', 'TPU'] },
          { key: 'case-type', values: ['Накладка'] },
        ],
      });

      expect(where.AND).toHaveLength(2);
      expect(where.AND).toEqual([
        {
          specValues: {
            some: expect.objectContaining({
              value: { in: ['Силікон', 'TPU'] },
              definition: expect.objectContaining({ key: 'material' }),
            }),
          },
        },
        {
          specValues: {
            some: expect.objectContaining({
              value: { in: ['Накладка'] },
              definition: expect.objectContaining({ key: 'case-type' }),
            }),
          },
        },
      ]);
      expect(where).not.toHaveProperty('specValues');
    });

    // TASK-706: «TEXT is never a facet» was enforced on read (filterable-specs),
    // on write (validateFacetType), in the seed and the import — but not when a
    // `?specs=` filter was APPLIED, so a hand-written `?specs=screen:6.1" OLED`
    // narrowed the public listing by a free-text spec. The guard lives in the
    // builder so all three of its readers (listing, facet counters, compat
    // landings) apply it identically.
    it('matches a facet only through a filterable definition of a facetable type', () => {
      const where = buildProductListWhere({
        specFilters: [{ key: 'screen', values: ['6.1" OLED'] }],
      });

      expect(where.AND).toEqual([
        {
          specValues: {
            some: {
              value: { in: ['6.1" OLED'] },
              definition: {
                key: 'screen',
                isFilterable: true,
                type: { in: [...FACETABLE_TYPES] },
              },
            },
          },
        },
      ]);
    });

    it('never lets TEXT or NUMBER into the facet type set', () => {
      const where = buildProductListWhere({ specFilters: [{ key: 'k', values: ['v'] }] });
      const entry = (where.AND as Array<{ specValues: { some: { definition: unknown } } }>)[0];
      const definition = entry.specValues.some.definition as { type: { in: AttributeType[] } };

      expect(definition.type.in).not.toContain(AttributeType.TEXT);
      expect(definition.type.in).not.toContain(AttributeType.NUMBER);
    });

    it('leaves AND off when no facet is requested', () => {
      expect(buildProductListWhere({ specFilters: [] })).not.toHaveProperty('AND');
      expect(buildProductListWhere({})).not.toHaveProperty('AND');
    });
  });
});
