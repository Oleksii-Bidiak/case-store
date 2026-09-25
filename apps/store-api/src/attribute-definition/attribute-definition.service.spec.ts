import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { AttributeType } from '@prisma/client';
import { AttributeDefinitionService } from './attribute-definition.service';
import { AttributeDefinitionRepository } from './attribute-definition.repository';
import { CategoryRepository } from '../category';
import { CatalogueFilterResolver } from '../catalog-filter/catalogue-filter.resolver';
import { ConfigService } from '@nestjs/config';
import { CacheService, FILTERABLE_SPECS_PREFIX } from '../cache';
import { MAX_SPEC_FACETS } from '../product/dto/product-list-query.dto';
import {
  ReorderDuplicateIdError,
  ReorderNotFoundError,
  ReorderStaleError,
} from '../common/reorder';

describe('AttributeDefinitionService', () => {
  let service: AttributeDefinitionService;
  const repo = {
    findByCategoryId: jest.fn(),
    findById: jest.fn(),
    findByCategoryAndKey: jest.fn(),
    findEffectiveForCategory: jest.fn(),
    findValueCountsByKey: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    reorder: jest.fn(),
  };
  const categoryRepository = {
    findById: jest.fn(),
    findSubtreeIds: jest.fn(),
    findByIds: jest.fn(),
  };
  const catalogueFilters = { resolve: jest.fn() };
  const cache = { get: jest.fn(), set: jest.fn(), delByPrefix: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    categoryRepository.findById.mockResolvedValue({ id: 'cat' });
    catalogueFilters.resolve.mockResolvedValue({});
    cache.get.mockResolvedValue(null);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttributeDefinitionService,
        { provide: AttributeDefinitionRepository, useValue: repo },
        { provide: CategoryRepository, useValue: categoryRepository },
        { provide: CatalogueFilterResolver, useValue: catalogueFilters },
        { provide: CacheService, useValue: cache },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
      ],
    }).compile();
    service = module.get(AttributeDefinitionService);
  });

  describe('create', () => {
    it('rejects a duplicate (categoryId, key) with a friendly conflict', async () => {
      repo.findByCategoryAndKey.mockResolvedValue({ id: 'existing', key: 'material' });

      await expect(
        service.create('cat', { key: 'material', label: 'Матеріал' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('requires a non-empty options list for a SELECT definition', async () => {
      repo.findByCategoryAndKey.mockResolvedValue(null);

      await expect(
        service.create('cat', { key: 'material', label: 'Матеріал', type: AttributeType.SELECT }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('creates a SELECT definition with options', async () => {
      repo.findByCategoryAndKey.mockResolvedValue(null);
      repo.create.mockResolvedValue({
        id: 'd1',
        categoryId: 'cat',
        key: 'material',
        label: 'Матеріал',
        type: AttributeType.SELECT,
        unit: null,
        options: ['Силікон', 'Шкіра'],
        isFilterable: true,
        sortOrder: 0,
      });

      const result = await service.create('cat', {
        key: 'material',
        label: 'Матеріал',
        type: AttributeType.SELECT,
        options: ['Силікон', 'Шкіра'],
        isFilterable: true,
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ options: ['Силікон', 'Шкіра'], type: AttributeType.SELECT }),
      );
      expect(result.options).toEqual(['Силікон', 'Шкіра']);
    });

    it('404s when the category does not exist', async () => {
      categoryRepository.findById.mockResolvedValue(null);

      await expect(
        service.create('ghost', { key: 'material', label: 'Матеріал' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([AttributeType.TEXT, AttributeType.NUMBER])(
      'refuses to make a %s definition a catalogue facet (TASK-488)',
      async (type) => {
        repo.findByCategoryAndKey.mockResolvedValue(null);

        await expect(
          service.create('cat', {
            key: 'protection',
            label: 'Захист',
            type,
            isFilterable: true,
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(repo.create).not.toHaveBeenCalled();
      },
    );

    it('allows a BOOLEAN facet', async () => {
      repo.findByCategoryAndKey.mockResolvedValue(null);
      repo.create.mockResolvedValue({
        id: 'd1',
        categoryId: 'cat',
        key: 'magsafe',
        label: 'Підтримка MagSafe',
        type: AttributeType.BOOLEAN,
        unit: null,
        options: null,
        isFilterable: true,
        sortOrder: 0,
      });

      const result = await service.create('cat', {
        key: 'magsafe',
        label: 'Підтримка MagSafe',
        type: AttributeType.BOOLEAN,
        isFilterable: true,
      });

      expect(result.isFilterable).toBe(true);
    });

    it('still allows a TEXT definition that is not a facet', async () => {
      repo.findByCategoryAndKey.mockResolvedValue(null);
      repo.create.mockResolvedValue({
        id: 'd1',
        categoryId: 'cat',
        key: 'protection',
        label: 'Захист',
        type: AttributeType.TEXT,
        unit: null,
        options: null,
        isFilterable: false,
        sortOrder: 0,
      });

      await expect(
        service.create('cat', { key: 'protection', label: 'Захист', type: AttributeType.TEXT }),
      ).resolves.toMatchObject({ isFilterable: false });
    });
  });

  describe('update — the facet type rule (TASK-488)', () => {
    const selectFacet = {
      id: 'd1',
      categoryId: 'cat',
      key: 'hardness',
      label: 'Твердість',
      type: AttributeType.SELECT,
      unit: null,
      options: ['9H', '10H'],
      isFilterable: true,
      sortOrder: 0,
    };

    it('refuses to retype an existing facet into TEXT', async () => {
      // Checked on the RESULTING pair, not on the payload: the operator did not
      // send `isFilterable`, but the row is already a facet, and TEXT + facet is
      // the state B-10 forbids.
      repo.findById.mockResolvedValue(selectFacet);

      await expect(service.update('d1', { type: AttributeType.TEXT })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('allows the retype when the facet flag is dropped in the same call', async () => {
      repo.findById.mockResolvedValue(selectFacet);
      repo.update.mockResolvedValue({
        ...selectFacet,
        type: AttributeType.TEXT,
        options: [],
        isFilterable: false,
      });

      await expect(
        service.update('d1', { type: AttributeType.TEXT, isFilterable: false }),
      ).resolves.toMatchObject({ isFilterable: false });
    });

    it('refuses to tick the facet box on an existing TEXT definition', async () => {
      repo.findById.mockResolvedValue({
        ...selectFacet,
        type: AttributeType.TEXT,
        options: [],
        isFilterable: false,
      });

      await expect(service.update('d1', { isFilterable: true })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('getFilterableSpecs', () => {
    const materialDef = {
      id: 'd-material',
      categoryId: 'cat',
      key: 'material',
      label: 'Матеріал',
      type: AttributeType.SELECT,
      unit: null,
      options: ['Силікон', 'Шкіра'],
      isFilterable: true,
      sortOrder: 0,
    };
    const internalDef = { ...materialDef, id: 'd-int', key: 'internal', isFilterable: false };

    /** The public-visibility half of the params every call below must carry. */
    const publicScope = {
      isActive: true,
      categoryActiveOnly: true,
      deleted: false,
    };

    it('returns only isFilterable definitions paired with counted subtree values', async () => {
      repo.findEffectiveForCategory.mockResolvedValue([materialDef, internalDef]);
      categoryRepository.findSubtreeIds.mockResolvedValue(['cat', 'child']);
      repo.findValueCountsByKey.mockResolvedValue(
        new Map([
          [
            'material',
            [
              { value: 'Силікон', count: 12 },
              { value: 'Шкіра', count: 3 },
            ],
          ],
        ]),
      );

      const result = await service.getFilterableSpecs('cat');

      expect(result).toHaveLength(1);
      expect(result[0].definition.key).toBe('material');
      expect(result[0].values).toEqual([
        { value: 'Силікон', count: 12 },
        { value: 'Шкіра', count: 3 },
      ]);
      expect(repo.findValueCountsByKey).toHaveBeenCalledWith(
        ['material'],
        expect.objectContaining({ categoryIds: ['cat', 'child'], ...publicScope }),
      );
    });

    it('forwards the ACTIVE filters so the counts describe the same slice (TASK-489)', async () => {
      // The substance of the task: a count that ignored the brand/price/stock
      // filters would advertise «Силікон (12)» on a page that then shows eight.
      repo.findEffectiveForCategory.mockResolvedValue([materialDef]);
      categoryRepository.findSubtreeIds.mockResolvedValue(['cat']);
      catalogueFilters.resolve.mockResolvedValue({ brandId: 'brand-1', deviceModelId: 'dev-1' });
      repo.findValueCountsByKey.mockResolvedValue(
        new Map([['material', [{ value: 'Силікон', count: 2 }]]]),
      );

      await service.getFilterableSpecs('cat', {
        brand: 'apple',
        device: 'iphone-15',
        minPrice: 100,
        maxPrice: 900,
        search: 'чохол',
        specs: 'form:Накладка',
        inStock: true,
        onSale: true,
      });

      expect(catalogueFilters.resolve).toHaveBeenCalledWith({
        brand: 'apple',
        device: 'iphone-15',
      });
      expect(repo.findValueCountsByKey).toHaveBeenCalledWith(['material'], {
        categoryIds: ['cat'],
        brandId: 'brand-1',
        deviceModelId: 'dev-1',
        minPrice: 100,
        maxPrice: 900,
        search: 'чохол',
        specFilters: [{ key: 'form', values: ['Накладка'] }],
        inStock: true,
        onSale: true,
        ...publicScope,
      });
    });

    it('returns an empty list (no subtree query) when no filterable specs exist', async () => {
      repo.findEffectiveForCategory.mockResolvedValue([internalDef]);

      expect(await service.getFilterableSpecs('cat')).toEqual([]);
      expect(categoryRepository.findSubtreeIds).not.toHaveBeenCalled();
    });

    it('drops a filterable definition with NO values in this subtree (TASK-487)', async () => {
      // Definitions are declared on the ROOT and inherited by every descendant,
      // so «Колір» reaches a subcategory whose products have no colour at all.
      // Surfacing it would render a facet a shopper can open and find empty.
      const colorDef = { ...materialDef, id: 'd-color', key: 'color', label: 'Колір' };
      repo.findEffectiveForCategory.mockResolvedValue([materialDef, colorDef]);
      categoryRepository.findSubtreeIds.mockResolvedValue(['cat']);
      repo.findValueCountsByKey.mockResolvedValue(
        new Map([['material', [{ value: 'Силікон', count: 1 }]]]),
      );

      const result = await service.getFilterableSpecs('cat');

      expect(result.map((facet) => facet.definition.key)).toEqual(['material']);
    });

    it('drops a filterable TEXT definition — TEXT is never a facet (TASK-488)', async () => {
      // The row the XLSX import writes: every column it meets is typed TEXT.
      // One such row flagged filterable publishes a sidebar control holding one
      // value per product. The write path refuses the pair now, but rows older
      // than the rule still exist, so the READ path drops them too.
      const protectionDef = {
        ...materialDef,
        id: 'd-protection',
        key: 'protection',
        label: 'Захист',
        type: AttributeType.TEXT,
        options: [],
      };
      repo.findEffectiveForCategory.mockResolvedValue([materialDef, protectionDef]);
      categoryRepository.findSubtreeIds.mockResolvedValue(['cat']);
      repo.findValueCountsByKey.mockResolvedValue(
        new Map([
          ['material', [{ value: 'Силікон', count: 4 }]],
          [
            'protection',
            [
              { value: 'Посилені кути', count: 2 },
              { value: 'Бортик над екраном', count: 1 },
            ],
          ],
        ]),
      );

      const result = await service.getFilterableSpecs('cat');

      expect(result.map((facet) => facet.definition.key)).toEqual(['material']);
      // Not even queried for: the TEXT definition never reaches the value scan.
      expect(repo.findValueCountsByKey).toHaveBeenCalledWith(['material'], expect.anything());
    });

    it('drops a filterable NUMBER definition for the same reason', async () => {
      const batteryDef = {
        ...materialDef,
        id: 'd-battery',
        key: 'battery',
        label: 'Акумулятор',
        type: AttributeType.NUMBER,
        options: [],
      };
      repo.findEffectiveForCategory.mockResolvedValue([batteryDef]);

      expect(await service.getFilterableSpecs('cat')).toEqual([]);
      expect(categoryRepository.findSubtreeIds).not.toHaveBeenCalled();
    });

    it('keeps a BOOLEAN facet — «Так»/«Ні» is a closed value set', async () => {
      const magsafeDef = {
        ...materialDef,
        id: 'd-magsafe',
        key: 'magsafe',
        label: 'Підтримка MagSafe',
        type: AttributeType.BOOLEAN,
        options: [],
        sortOrder: 1,
      };
      repo.findEffectiveForCategory.mockResolvedValue([materialDef, magsafeDef]);
      categoryRepository.findSubtreeIds.mockResolvedValue(['cat']);
      repo.findValueCountsByKey.mockResolvedValue(
        new Map([
          ['material', [{ value: 'Силікон', count: 5 }]],
          [
            'magsafe',
            [
              { value: 'false', count: 3 },
              { value: 'true', count: 2 },
            ],
          ],
        ]),
      );

      const result = await service.getFilterableSpecs('cat');

      expect(result.map((facet) => facet.definition.key)).toEqual(['material', 'magsafe']);
      expect(result[1].values).toEqual([
        { value: 'false', count: 3 },
        { value: 'true', count: 2 },
      ]);
    });

    it('surfaces the colour facet once its subtree has values', async () => {
      const colorDef = { ...materialDef, id: 'd-color', key: 'color', label: 'Колір' };
      repo.findEffectiveForCategory.mockResolvedValue([colorDef, materialDef]);
      categoryRepository.findSubtreeIds.mockResolvedValue(['cat']);
      repo.findValueCountsByKey.mockResolvedValue(
        new Map([
          [
            'color',
            [
              { value: 'Білий', count: 2 },
              { value: 'Чорний', count: 7 },
            ],
          ],
          ['material', [{ value: 'Силікон', count: 9 }]],
        ]),
      );

      const result = await service.getFilterableSpecs('cat');

      expect(result.map((facet) => facet.definition.key)).toEqual(['color', 'material']);
      expect(result[0].values).toEqual([
        { value: 'Білий', count: 2 },
        { value: 'Чорний', count: 7 },
      ]);
    });
  });

  describe('delete', () => {
    it('404s when the definition does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.delete('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deletes an existing definition', async () => {
      repo.findById.mockResolvedValue({ id: 'd1' });
      repo.delete.mockResolvedValue({ id: 'd1' });

      expect(await service.delete('d1')).toEqual({ id: 'd1' });
    });
  });

  // ─── reorder (TASK-298) ───────────────────────────────────────────────────

  describe('reorder', () => {
    const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    const makeDef = (id: string, sortOrder: number) => ({
      id,
      categoryId: 'cat',
      key: `k-${id}`,
      label: `L-${id}`,
      type: AttributeType.TEXT,
      unit: null,
      options: null,
      isFilterable: false,
      sortOrder,
    });

    it('returns the refreshed list read INSIDE the reorder transaction (no second read)', async () => {
      repo.reorder.mockResolvedValue([makeDef(b, 0), makeDef(a, 1)]);

      const result = await service.reorder('cat', { orderedIds: [b, a] });

      expect(repo.reorder).toHaveBeenCalledWith('cat', [b, a]);
      expect(result.map((d) => d.id)).toEqual([b, a]);
      // The refreshed list comes back from the reorder transaction itself.
      expect(repo.findByCategoryId).not.toHaveBeenCalled();
    });

    it('404s when the category does not exist, without touching the repository', async () => {
      categoryRepository.findById.mockResolvedValue(null);

      await expect(service.reorder('ghost', { orderedIds: [a] })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.reorder).not.toHaveBeenCalled();
    });

    it('maps a STALE (partial) payload onto a 409 carrying the stable code', async () => {
      repo.reorder.mockRejectedValue(new ReorderStaleError());

      await expect(service.reorder('cat', { orderedIds: [a] })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('maps a duplicate id onto a 400 and an unknown id onto a 404', async () => {
      repo.reorder.mockRejectedValueOnce(new ReorderDuplicateIdError());
      await expect(service.reorder('cat', { orderedIds: [a, a] })).rejects.toBeInstanceOf(
        BadRequestException,
      );

      repo.reorder.mockRejectedValueOnce(new ReorderNotFoundError());
      await expect(service.reorder('cat', { orderedIds: [a, b] })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lets a non-domain failure through untouched (a 500, never a misleading 4xx)', async () => {
      repo.reorder.mockRejectedValue(new Error('connection reset'));

      await expect(service.reorder('cat', { orderedIds: [a] })).rejects.toThrow('connection reset');
    });
  });

  // ─── facet cache (TASK-708) ───────────────────────────────────────────────

  describe('getFilterableSpecs — cache-aside (TASK-708)', () => {
    const materialDef = {
      id: 'd-material',
      categoryId: 'cat',
      key: 'material',
      label: 'Матеріал',
      type: AttributeType.SELECT,
      unit: null,
      options: ['Силікон'],
      isFilterable: true,
      sortOrder: 0,
    };

    beforeEach(() => {
      repo.findEffectiveForCategory.mockResolvedValue([materialDef]);
      categoryRepository.findSubtreeIds.mockResolvedValue(['cat']);
      repo.findValueCountsByKey.mockResolvedValue(
        new Map([['material', [{ value: 'Силікон', count: 4 }]]]),
      );
    });

    it('serves a hit without touching a repository', async () => {
      const cached = [{ definition: { key: 'material' }, values: [{ value: 'TPU', count: 1 }] }];
      cache.get.mockResolvedValue(cached);

      expect(await service.getFilterableSpecs('cat')).toBe(cached);
      expect(repo.findEffectiveForCategory).not.toHaveBeenCalled();
      expect(repo.findValueCountsByKey).not.toHaveBeenCalled();
    });

    it('serves a cached EMPTY list as a hit too (an empty sidebar is an answer)', async () => {
      cache.get.mockResolvedValue([]);

      expect(await service.getFilterableSpecs('cat')).toEqual([]);
      expect(repo.findEffectiveForCategory).not.toHaveBeenCalled();
    });

    it('writes a miss under the facet prefix', async () => {
      const result = await service.getFilterableSpecs('cat');

      expect(cache.set).toHaveBeenCalledTimes(1);
      const [key, value, ttl] = cache.set.mock.calls[0];
      expect(key.startsWith(`${FILTERABLE_SPECS_PREFIX}:`)).toBe(true);
      expect(value).toBe(result);
      expect(ttl).toBeGreaterThan(0);
    });

    it('keys on the canonical slug the resolver read back, not on what was typed', async () => {
      catalogueFilters.resolve.mockResolvedValue({
        brandId: 'brand-uuid',
        brandKey: 'apple',
        deviceModelId: 'dev-uuid',
        deviceKey: 'iphone-15',
      });

      await service.getFilterableSpecs('cat', { brand: 'APPLE-typed', device: 'whatever' });

      const key: string = cache.get.mock.calls[0][0];
      expect(key).toContain('brand=apple');
      expect(key).toContain('device=iphone-15');
      expect(key).not.toContain('APPLE-typed');
      expect(key).not.toContain('brand-uuid');
    });

    it('never reads one category’s or one filter set’s counts for another', async () => {
      await service.getFilterableSpecs('cat-a');
      await service.getFilterableSpecs('cat-b');
      await service.getFilterableSpecs('cat-a', { specs: 'material:Силікон' });
      await service.getFilterableSpecs('cat-a', { inStock: true });
      await service.getFilterableSpecs('cat-a', { search: 'чохол' });

      const keys = cache.get.mock.calls.map(([key]) => key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('keys on the APPLIED facets — a malformed chunk shares the clean request’s entry', async () => {
      await service.getFilterableSpecs('cat', { specs: 'material:Силікон' });
      await service.getFilterableSpecs('cat', { specs: 'material:Силікон;garbage' });

      expect(cache.get.mock.calls[0][0]).toBe(cache.get.mock.calls[1][0]);
    });

    it.each([
      [
        'create',
        async () => {
          repo.findByCategoryAndKey.mockResolvedValue(null);
          repo.create.mockResolvedValue({ ...materialDef });
          await service.create('cat', {
            key: 'material',
            label: 'Матеріал',
            type: AttributeType.SELECT,
            options: ['Силікон'],
          });
        },
      ],
      [
        'update',
        async () => {
          repo.findById.mockResolvedValue({ ...materialDef });
          repo.update.mockResolvedValue({ ...materialDef, label: 'Матеріал корпусу' });
          await service.update('d-material', { label: 'Матеріал корпусу' });
        },
      ],
      [
        'delete',
        async () => {
          repo.findById.mockResolvedValue({ ...materialDef });
          repo.delete.mockResolvedValue({ id: 'd-material' });
          await service.delete('d-material');
        },
      ],
      [
        'reorder',
        async () => {
          repo.reorder.mockResolvedValue([{ ...materialDef }]);
          await service.reorder('cat', { orderedIds: ['d-material'] });
        },
      ],
    ])('purges the facet cache after %s', async (_name, run) => {
      await run();

      expect(cache.delByPrefix).toHaveBeenCalledWith(FILTERABLE_SPECS_PREFIX);
    });

    it('does not purge when a write is refused', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.delete('ghost')).rejects.toBeInstanceOf(NotFoundException);
      expect(cache.delByPrefix).not.toHaveBeenCalled();
    });
  });

  // ─── facet ceiling (TASK-707) ─────────────────────────────────────────────

  describe('the facet ceiling (TASK-707)', () => {
    /** Seven filterable SELECT facets, `f1`…`f7`, in template order. */
    const defs = Array.from({ length: MAX_SPEC_FACETS + 1 }, (_, i) => ({
      id: `d-f${i + 1}`,
      categoryId: 'cat',
      key: `f${i + 1}`,
      label: `Фасет ${i + 1}`,
      type: AttributeType.SELECT,
      unit: null,
      options: ['a'],
      isFilterable: true,
      sortOrder: i,
    }));
    const counted = new Map(defs.map((def) => [def.key, [{ value: 'a', count: 1 }]]));

    beforeEach(() => {
      repo.findEffectiveForCategory.mockResolvedValue(defs);
      categoryRepository.findSubtreeIds.mockResolvedValue(['cat']);
      repo.findValueCountsByKey.mockResolvedValue(counted);
    });

    it('returns at most MAX_SPEC_FACETS facets, the first ones in template order', async () => {
      const result = await service.getFilterableSpecs('cat');

      expect(result.map((facet) => facet.definition.key)).toEqual([
        'f1',
        'f2',
        'f3',
        'f4',
        'f5',
        'f6',
      ]);
    });

    it('counts the ceiling over NON-EMPTY facets — an empty one does not take a slot', async () => {
      repo.findValueCountsByKey.mockResolvedValue(
        new Map([...counted].filter(([key]) => key !== 'f2')),
      );

      const result = await service.getFilterableSpecs('cat');

      expect(result.map((facet) => facet.definition.key)).toEqual([
        'f1',
        'f3',
        'f4',
        'f5',
        'f6',
        'f7',
      ]);
    });

    it('never hides an ACTIVE facet — a past-the-ceiling one takes the last free slot', async () => {
      // The «active but hidden» case: a link carries `?specs=f7:a`, the listing
      // is narrowed by it, and the sidebar must still offer the checkbox that
      // undoes it (and the chip must still find its label in this response).
      const result = await service.getFilterableSpecs('cat', { specs: 'f7:a' });

      const keys = result.map((facet) => facet.definition.key);
      expect(keys).toHaveLength(MAX_SPEC_FACETS);
      expect(keys).toContain('f7');
      expect(keys).toEqual(['f1', 'f2', 'f3', 'f4', 'f5', 'f7']);
    });

    it('offers every active facet even when all of them sit past the ceiling', async () => {
      const many = Array.from({ length: 10 }, (_, i) => ({
        ...defs[0],
        id: `m${i}`,
        key: `m${i}`,
      }));
      repo.findEffectiveForCategory.mockResolvedValue(many);
      repo.findValueCountsByKey.mockResolvedValue(
        new Map(many.map((def) => [def.key, [{ value: 'a', count: 1 }]])),
      );

      const result = await service.getFilterableSpecs('cat', { specs: 'm8:a;m9:a' });

      expect(result.map((facet) => facet.definition.key)).toEqual([
        'm0',
        'm1',
        'm2',
        'm3',
        'm8',
        'm9',
      ]);
    });
  });

  describe('getFacetCeilingReport (TASK-707)', () => {
    const facet = (categoryId: string, key: string, sortOrder: number) => ({
      id: `${categoryId}-${key}`,
      categoryId,
      key,
      label: key.toUpperCase(),
      type: AttributeType.SELECT,
      unit: null,
      options: ['a'],
      isFilterable: true,
      sortOrder,
    });

    it('lists every category of the subtree whose DECLARED facets exceed the ceiling', async () => {
      categoryRepository.findSubtreeIds.mockResolvedValue(['root', 'child']);
      const rootFacets = Array.from({ length: 5 }, (_, i) => facet('root', `r${i}`, i));
      repo.findEffectiveForCategory.mockImplementation(async (id: string) =>
        id === 'root'
          ? rootFacets
          : [...rootFacets, facet('child', 'c0', 10), facet('child', 'c1', 11)],
      );
      categoryRepository.findByIds.mockResolvedValue([{ id: 'child', name: 'Дочірня' }]);

      const report = await service.getFacetCeilingReport('root');

      expect(report.limit).toBe(MAX_SPEC_FACETS);
      expect(report.categories).toEqual([
        { categoryId: 'child', categoryName: 'Дочірня', facetCount: 7, overflowLabels: ['C1'] },
      ]);
    });

    it('ignores definitions that are not facets (not filterable, or TEXT)', async () => {
      categoryRepository.findSubtreeIds.mockResolvedValue(['root']);
      repo.findEffectiveForCategory.mockResolvedValue([
        ...Array.from({ length: 6 }, (_, i) => facet('root', `r${i}`, i)),
        { ...facet('root', 'plain', 7), isFilterable: false },
        { ...facet('root', 'text', 8), type: AttributeType.TEXT },
      ]);

      const report = await service.getFacetCeilingReport('root');

      expect(report.categories).toEqual([]);
      expect(categoryRepository.findByIds).not.toHaveBeenCalled();
    });

    it('404s for an unknown category', async () => {
      categoryRepository.findById.mockResolvedValue(null);

      await expect(service.getFacetCeilingReport('ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
