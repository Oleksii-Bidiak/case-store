import { Test, TestingModule } from '@nestjs/testing';
import { AddonApplicabilityResolver } from './addon-applicability.resolver';
import { AddonServiceRepository } from './addon-service.repository';
import { CategoryRepository } from '../category';
import type { AddonServiceRow, CategoryTemplateRow, ProductDeltaRow } from './addon-service.types';

/**
 * TDD suite for the heart of TASK-174 (plan 150 §Money logic + resolver, cases
 * 1–14): nearest-ancestor-wins category-template resolution + per-product
 * ADD/REMOVE/OVERRIDE delta application.
 *
 * Both repositories are fully mocked — no DB. The SQL behind
 * `findAncestorChainsOrdered` is covered separately (category.repository.spec /
 * int-spec); here the chain is fed in directly so the resolution SEMANTICS are
 * tested in isolation.
 */

// ─── Catalog fixtures ────────────────────────────────────────────────────────
const warranty: AddonServiceRow = {
  id: 'svc-warranty',
  name: 'Warranty',
  description: '24 months',
  price: '499.00',
  isActive: true,
};
const insurance: AddonServiceRow = {
  id: 'svc-insurance',
  name: 'Insurance',
  description: null,
  price: '899.00',
  isActive: true,
};
const setup: AddonServiceRow = {
  id: 'svc-setup',
  name: 'Setup',
  description: null,
  price: '299.00',
  isActive: true,
};
const tradeIn: AddonServiceRow = {
  id: 'svc-tradein',
  name: 'Trade-in',
  description: null,
  price: '0.00',
  isActive: true,
};
const retired: AddonServiceRow = {
  id: 'svc-retired',
  name: 'Retired',
  description: null,
  price: '100.00',
  isActive: false,
};

const templateRow = (categoryId: string, service: AddonServiceRow): CategoryTemplateRow => ({
  categoryId,
  addonServiceId: service.id,
  addonService: service,
});

const deltaRow = (
  productId: string,
  service: AddonServiceRow,
  type: 'ADD' | 'REMOVE' | 'OVERRIDE',
  price: string | null = null,
): ProductDeltaRow => ({
  productId,
  addonServiceId: service.id,
  type,
  price,
  addonService: service,
});

describe('AddonApplicabilityResolver (TASK-174)', () => {
  let resolver: AddonApplicabilityResolver;

  const findTemplateRowsForCategories = jest.fn();
  const findDeltaRowsForProducts = jest.fn();
  const findAncestorChainsOrdered = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    findTemplateRowsForCategories.mockResolvedValue([]);
    findDeltaRowsForProducts.mockResolvedValue([]);
    findAncestorChainsOrdered.mockResolvedValue(new Map());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddonApplicabilityResolver,
        {
          provide: AddonServiceRepository,
          useValue: { findTemplateRowsForCategories, findDeltaRowsForProducts },
        },
        { provide: CategoryRepository, useValue: { findAncestorChainsOrdered } },
      ],
    }).compile();

    resolver = module.get(AddonApplicabilityResolver);
  });

  // ─── Cases 1–4: nearest-ancestor-wins template resolution ──────────────────

  it('case 1 — a category with its own template returns exactly that template', async () => {
    findAncestorChainsOrdered.mockResolvedValue(new Map([['cat-audio', ['cat-audio']]]));
    findTemplateRowsForCategories.mockResolvedValue([
      templateRow('cat-audio', warranty),
      templateRow('cat-audio', insurance),
    ]);

    const addons = await resolver.resolveForProduct({ id: 'p1', categoryId: 'cat-audio' });

    expect(addons.map((a) => a.addonServiceId)).toEqual(['svc-insurance', 'svc-warranty']);
    expect(addons.every((a) => a.source === 'template')).toBe(true);
    expect(addons.find((a) => a.addonServiceId === 'svc-warranty')?.price).toBe('499.00');
  });

  it('case 2 — a subcategory with NO own template inherits its parent (depth 1)', async () => {
    findAncestorChainsOrdered.mockResolvedValue(
      new Map([['cat-child', ['cat-child', 'cat-root']]]),
    );
    findTemplateRowsForCategories.mockResolvedValue([templateRow('cat-root', warranty)]);

    const addons = await resolver.resolveForProduct({ id: 'p1', categoryId: 'cat-child' });

    expect(addons.map((a) => a.addonServiceId)).toEqual(['svc-warranty']);
  });

  it('case 3 — the walk does not stop at depth 1: a grandparent template is inherited', async () => {
    findAncestorChainsOrdered.mockResolvedValue(
      new Map([['cat-grandchild', ['cat-grandchild', 'cat-child', 'cat-root']]]),
    );
    findTemplateRowsForCategories.mockResolvedValue([templateRow('cat-root', insurance)]);

    const addons = await resolver.resolveForProduct({ id: 'p1', categoryId: 'cat-grandchild' });

    expect(addons.map((a) => a.addonServiceId)).toEqual(['svc-insurance']);
  });

  it('case 4 — an own template fully SHADOWS an ancestor template (no merge)', async () => {
    findAncestorChainsOrdered.mockResolvedValue(
      new Map([['cat-child', ['cat-child', 'cat-root']]]),
    );
    findTemplateRowsForCategories.mockResolvedValue([
      templateRow('cat-child', setup),
      templateRow('cat-root', warranty),
      templateRow('cat-root', insurance),
    ]);

    const addons = await resolver.resolveForProduct({ id: 'p1', categoryId: 'cat-child' });

    expect(addons.map((a) => a.addonServiceId)).toEqual(['svc-setup']);
  });

  // ─── Cases 5–9, 12: per-product deltas ─────────────────────────────────────

  it('case 5 — an ADD delta surfaces a product-exclusive service (own price, else catalog)', async () => {
    findAncestorChainsOrdered.mockResolvedValue(new Map([['cat-a', ['cat-a']]]));
    findTemplateRowsForCategories.mockResolvedValue([templateRow('cat-a', warranty)]);
    findDeltaRowsForProducts.mockResolvedValue([deltaRow('p1', tradeIn, 'ADD')]);

    const addons = await resolver.resolveForProduct({ id: 'p1', categoryId: 'cat-a' });
    const added = addons.find((a) => a.addonServiceId === 'svc-tradein');

    expect(added).toEqual({
      addonServiceId: 'svc-tradein',
      name: 'Trade-in',
      description: null,
      price: '0.00',
      source: 'add',
    });
  });

  it('case 5b — an ADD delta with its own price overrides the catalog price', async () => {
    findAncestorChainsOrdered.mockResolvedValue(new Map([['cat-a', ['cat-a']]]));
    findDeltaRowsForProducts.mockResolvedValue([deltaRow('p1', tradeIn, 'ADD', '150.00')]);

    const addons = await resolver.resolveForProduct({ id: 'p1', categoryId: 'cat-a' });

    expect(addons).toEqual([
      {
        addonServiceId: 'svc-tradein',
        name: 'Trade-in',
        description: null,
        price: '150.00',
        source: 'add',
      },
    ]);
  });

  it('case 6 — a REMOVE delta suppresses an inherited service for that product only', async () => {
    findAncestorChainsOrdered.mockResolvedValue(new Map([['cat-a', ['cat-a']]]));
    findTemplateRowsForCategories.mockResolvedValue([
      templateRow('cat-a', warranty),
      templateRow('cat-a', insurance),
    ]);
    findDeltaRowsForProducts.mockResolvedValue([deltaRow('p1', warranty, 'REMOVE')]);

    const addons = await resolver.resolveForProduct({ id: 'p1', categoryId: 'cat-a' });

    expect(addons.map((a) => a.addonServiceId)).toEqual(['svc-insurance']);
  });

  it('case 7 — a dangling REMOVE (service no longer templated) is a silent no-op', async () => {
    findAncestorChainsOrdered.mockResolvedValue(new Map([['cat-a', ['cat-a']]]));
    findTemplateRowsForCategories.mockResolvedValue([templateRow('cat-a', insurance)]);
    findDeltaRowsForProducts.mockResolvedValue([deltaRow('p1', warranty, 'REMOVE')]);

    const addons = await resolver.resolveForProduct({ id: 'p1', categoryId: 'cat-a' });

    expect(addons.map((a) => a.addonServiceId)).toEqual(['svc-insurance']);
  });

  it('case 8 — an OVERRIDE delta replaces the effective price of an inherited service', async () => {
    findAncestorChainsOrdered.mockResolvedValue(new Map([['cat-a', ['cat-a']]]));
    findTemplateRowsForCategories.mockResolvedValue([templateRow('cat-a', insurance)]);
    findDeltaRowsForProducts.mockResolvedValue([deltaRow('p1', insurance, 'OVERRIDE', '1299.00')]);

    const addons = await resolver.resolveForProduct({ id: 'p1', categoryId: 'cat-a' });

    expect(addons).toEqual([
      {
        addonServiceId: 'svc-insurance',
        name: 'Insurance',
        description: null,
        price: '1299.00',
        source: 'override',
      },
    ]);
  });

  it('case 9 (TASK-404) — a base-less OVERRIDE keeps the service, resolved as an ADD', async () => {
    findAncestorChainsOrdered.mockResolvedValue(new Map([['cat-a', ['cat-a']]]));
    findTemplateRowsForCategories.mockResolvedValue([templateRow('cat-a', warranty)]);
    findDeltaRowsForProducts.mockResolvedValue([deltaRow('p1', insurance, 'OVERRIDE', '1299.00')]);

    const addons = await resolver.resolveForProduct({ id: 'p1', categoryId: 'cat-a' });

    // The service must NOT disappear: an admin re-pricing a product-exclusive
    // add-on used to turn its ADD row into an OVERRIDE (one row per pair), and
    // an inert OVERRIDE deleted the service from the product outright.
    expect(addons).toEqual([
      {
        addonServiceId: 'svc-insurance',
        name: 'Insurance',
        description: null,
        price: '1299.00',
        source: 'add',
      },
      {
        addonServiceId: 'svc-warranty',
        name: 'Warranty',
        description: '24 months',
        price: '499.00',
        source: 'template',
      },
    ]);
  });

  it('case 9b (TASK-404) — a base-less OVERRIDE survives with no category at all', async () => {
    findAncestorChainsOrdered.mockResolvedValue(new Map());
    findDeltaRowsForProducts.mockResolvedValue([deltaRow('p1', tradeIn, 'OVERRIDE', '250.00')]);

    const addons = await resolver.resolveForProduct({ id: 'p1', categoryId: null });

    expect(addons).toEqual([
      {
        addonServiceId: 'svc-tradein',
        name: 'Trade-in',
        description: null,
        price: '250.00',
        source: 'add',
      },
    ]);
  });

  it('case 9c (TASK-404) — a base-less OVERRIDE never resurrects a deactivated service', async () => {
    findAncestorChainsOrdered.mockResolvedValue(new Map([['cat-a', ['cat-a']]]));
    findTemplateRowsForCategories.mockResolvedValue([templateRow('cat-a', warranty)]);
    findDeltaRowsForProducts.mockResolvedValue([deltaRow('p1', retired, 'OVERRIDE', '10.00')]);

    const addons = await resolver.resolveForProduct({ id: 'p1', categoryId: 'cat-a' });

    expect(addons.map((a) => a.addonServiceId)).toEqual(['svc-warranty']);
  });

  it('case 12 — a product with no category resolves an empty base set, but ADD still surfaces', async () => {
    findAncestorChainsOrdered.mockResolvedValue(new Map());
    findDeltaRowsForProducts.mockResolvedValue([deltaRow('p1', tradeIn, 'ADD')]);

    const addons = await resolver.resolveForProduct({ id: 'p1', categoryId: null });

    expect(findAncestorChainsOrdered).toHaveBeenCalledWith([]);
    expect(addons.map((a) => a.addonServiceId)).toEqual(['svc-tradein']);
  });

  it('case 12b — a product with no category and no deltas resolves nothing', async () => {
    expect(await resolver.resolveForProduct({ id: 'p1', categoryId: null })).toEqual([]);
  });

  // ─── Cases 10–11: the template link is LIVE, and shadowing is per-entry ─────

  it('case 10 — a template edit is reflected immediately for every inheriting product', async () => {
    findAncestorChainsOrdered.mockResolvedValue(
      new Map([['cat-child', ['cat-child', 'cat-root']]]),
    );
    findTemplateRowsForCategories.mockResolvedValue([templateRow('cat-root', warranty)]);

    const before = await resolver.resolveForProduct({ id: 'p1', categoryId: 'cat-child' });
    expect(before.map((a) => a.addonServiceId)).toEqual(['svc-warranty']);

    // Admin adds Insurance to the parent's template — no product-level write.
    findTemplateRowsForCategories.mockResolvedValue([
      templateRow('cat-root', warranty),
      templateRow('cat-root', insurance),
    ]);

    const after = await resolver.resolveForProduct({ id: 'p1', categoryId: 'cat-child' });
    expect(after.map((a) => a.addonServiceId)).toEqual(['svc-insurance', 'svc-warranty']);
  });

  it('case 11 — an OVERRIDE shadows ONLY its own entry; other template edits still flow through', async () => {
    findAncestorChainsOrdered.mockResolvedValue(new Map([['cat-a', ['cat-a']]]));
    findTemplateRowsForCategories.mockResolvedValue([templateRow('cat-a', insurance)]);
    findDeltaRowsForProducts.mockResolvedValue([deltaRow('p1', insurance, 'OVERRIDE', '1299.00')]);

    // Admin adds Setup to the same template AND repriced Insurance in the catalog.
    findTemplateRowsForCategories.mockResolvedValue([
      templateRow('cat-a', { ...insurance, price: '950.00' }),
      templateRow('cat-a', setup),
    ]);

    const addons = await resolver.resolveForProduct({ id: 'p1', categoryId: 'cat-a' });

    // The override still wins for Insurance; the newly-templated Setup flows in live.
    expect(addons).toEqual([
      {
        addonServiceId: 'svc-insurance',
        name: 'Insurance',
        description: null,
        price: '1299.00',
        source: 'override',
      },
      {
        addonServiceId: 'svc-setup',
        name: 'Setup',
        description: null,
        price: '299.00',
        source: 'template',
      },
    ]);
  });

  // ─── Case 13: isActive is a hard filter, whatever produced the entry ────────

  it('case 13 — an inactive service never appears, from a template, an ADD, or an OVERRIDE', async () => {
    findAncestorChainsOrdered.mockResolvedValue(
      new Map([
        ['cat-a', ['cat-a']],
        ['cat-b', ['cat-b']],
      ]),
    );
    findTemplateRowsForCategories.mockResolvedValue([
      templateRow('cat-a', retired),
      templateRow('cat-a', warranty),
      templateRow('cat-b', retired),
    ]);
    findDeltaRowsForProducts.mockResolvedValue([
      deltaRow('p-add', retired, 'ADD', '10.00'),
      deltaRow('p-override', retired, 'OVERRIDE', '10.00'),
    ]);

    const fromTemplate = await resolver.resolveForProduct({ id: 'p-plain', categoryId: 'cat-a' });
    const fromAdd = await resolver.resolveForProduct({ id: 'p-add', categoryId: 'cat-a' });
    const fromOverride = await resolver.resolveForProduct({
      id: 'p-override',
      categoryId: 'cat-b',
    });

    expect(fromTemplate.map((a) => a.addonServiceId)).toEqual(['svc-warranty']);
    expect(fromAdd.map((a) => a.addonServiceId)).toEqual(['svc-warranty']);
    expect(fromOverride).toEqual([]);
  });

  // ─── Case 14: batched/single parity + no-N+1 ───────────────────────────────

  describe('case 14 — resolveForProducts (batched)', () => {
    const products = [
      { id: 'p1', categoryId: 'cat-child' }, // inherits cat-root
      { id: 'p2', categoryId: 'cat-child' }, // same, but carries a REMOVE
      { id: 'p3', categoryId: 'cat-other' }, // own template
      { id: 'p4', categoryId: null }, // no category, ADD only
    ];

    const arrange = () => {
      findAncestorChainsOrdered.mockResolvedValue(
        new Map([
          ['cat-child', ['cat-child', 'cat-root']],
          ['cat-other', ['cat-other']],
        ]),
      );
      findTemplateRowsForCategories.mockResolvedValue([
        templateRow('cat-root', warranty),
        templateRow('cat-root', insurance),
        templateRow('cat-other', setup),
      ]);
      findDeltaRowsForProducts.mockResolvedValue([
        deltaRow('p2', warranty, 'REMOVE'),
        deltaRow('p3', setup, 'OVERRIDE', '350.00'),
        deltaRow('p4', tradeIn, 'ADD'),
      ]);
    };

    it('returns results identical to per-product resolution for a mixed batch', async () => {
      arrange();
      const batched = await resolver.resolveForProducts(products);

      for (const product of products) {
        arrange();
        const single = await resolver.resolveForProduct(product);
        expect(batched.get(product.id)).toEqual(single);
      }

      expect(batched.get('p1')?.map((a) => a.addonServiceId)).toEqual([
        'svc-insurance',
        'svc-warranty',
      ]);
      expect(batched.get('p2')?.map((a) => a.addonServiceId)).toEqual(['svc-insurance']);
      expect(batched.get('p3')).toEqual([
        {
          addonServiceId: 'svc-setup',
          name: 'Setup',
          description: null,
          price: '350.00',
          source: 'override',
        },
      ]);
      expect(batched.get('p4')?.map((a) => a.addonServiceId)).toEqual(['svc-tradein']);
    });

    it('issues a BOUNDED number of queries regardless of product count (no N+1)', async () => {
      arrange();
      const many = Array.from({ length: 25 }, (_, i) => ({
        id: `p${i}`,
        categoryId: i % 2 === 0 ? 'cat-child' : 'cat-other',
      }));

      await resolver.resolveForProducts(many);

      expect(findAncestorChainsOrdered).toHaveBeenCalledTimes(1);
      expect(findTemplateRowsForCategories).toHaveBeenCalledTimes(1);
      expect(findDeltaRowsForProducts).toHaveBeenCalledTimes(1);
    });

    it('returns an entry for EVERY product, empty array included, and issues no query when empty', async () => {
      expect(await resolver.resolveForProducts([])).toEqual(new Map());
      expect(findAncestorChainsOrdered).not.toHaveBeenCalled();
      expect(findTemplateRowsForCategories).not.toHaveBeenCalled();
      expect(findDeltaRowsForProducts).not.toHaveBeenCalled();

      findAncestorChainsOrdered.mockResolvedValue(new Map([['cat-empty', ['cat-empty']]]));
      const resolved = await resolver.resolveForProducts([{ id: 'p9', categoryId: 'cat-empty' }]);
      expect(resolved.get('p9')).toEqual([]);
    });
  });

  // ─── Admin read view: where did this category's template come from? ────────

  describe('resolveTemplateForCategory (admin affordance)', () => {
    it("reports source 'own' when the category declares its own template", async () => {
      findAncestorChainsOrdered.mockResolvedValue(
        new Map([['cat-child', ['cat-child', 'cat-root']]]),
      );
      findTemplateRowsForCategories.mockResolvedValue([
        templateRow('cat-child', setup),
        templateRow('cat-root', warranty),
      ]);

      const resolved = await resolver.resolveTemplateForCategory('cat-child');

      expect(resolved.source).toBe('own');
      expect(resolved.sourceCategoryId).toBe('cat-child');
      expect(resolved.addons.map((a) => a.addonServiceId)).toEqual(['svc-setup']);
    });

    it("reports source 'inherited' + the ancestor id it came from", async () => {
      findAncestorChainsOrdered.mockResolvedValue(
        new Map([['cat-child', ['cat-child', 'cat-root']]]),
      );
      findTemplateRowsForCategories.mockResolvedValue([templateRow('cat-root', warranty)]);

      const resolved = await resolver.resolveTemplateForCategory('cat-child');

      expect(resolved.source).toBe('inherited');
      expect(resolved.sourceCategoryId).toBe('cat-root');
      expect(resolved.addons.map((a) => a.addonServiceId)).toEqual(['svc-warranty']);
    });

    it("reports source 'none' when no category in the chain declares a template", async () => {
      findAncestorChainsOrdered.mockResolvedValue(
        new Map([['cat-child', ['cat-child', 'cat-root']]]),
      );

      const resolved = await resolver.resolveTemplateForCategory('cat-child');

      expect(resolved).toEqual({ source: 'none', sourceCategoryId: null, addons: [] });
    });
  });
});
