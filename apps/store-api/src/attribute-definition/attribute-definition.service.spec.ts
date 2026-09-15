import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { AttributeType } from '@prisma/client';
import { AttributeDefinitionService } from './attribute-definition.service';
import { AttributeDefinitionRepository } from './attribute-definition.repository';
import { CategoryRepository } from '../category';
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
    findDistinctValuesByKey: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    reorder: jest.fn(),
  };
  const categoryRepository = { findById: jest.fn(), findSubtreeIds: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    categoryRepository.findById.mockResolvedValue({ id: 'cat' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttributeDefinitionService,
        { provide: AttributeDefinitionRepository, useValue: repo },
        { provide: CategoryRepository, useValue: categoryRepository },
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

    it('returns only isFilterable definitions paired with distinct subtree values', async () => {
      repo.findEffectiveForCategory.mockResolvedValue([materialDef, internalDef]);
      categoryRepository.findSubtreeIds.mockResolvedValue(['cat', 'child']);
      repo.findDistinctValuesByKey.mockResolvedValue(new Map([['material', ['Силікон', 'Шкіра']]]));

      const result = await service.getFilterableSpecs('cat');

      expect(result).toHaveLength(1);
      expect(result[0].definition.key).toBe('material');
      expect(result[0].values).toEqual(['Силікон', 'Шкіра']);
      expect(repo.findDistinctValuesByKey).toHaveBeenCalledWith(['material'], ['cat', 'child']);
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
      repo.findDistinctValuesByKey.mockResolvedValue(new Map([['material', ['Силікон']]]));

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
      repo.findDistinctValuesByKey.mockResolvedValue(
        new Map([
          ['material', ['Силікон']],
          ['protection', ['Посилені кути', 'Бортик над екраном']],
        ]),
      );

      const result = await service.getFilterableSpecs('cat');

      expect(result.map((facet) => facet.definition.key)).toEqual(['material']);
      // Not even queried for: the TEXT definition never reaches the value scan.
      expect(repo.findDistinctValuesByKey).toHaveBeenCalledWith(['material'], ['cat']);
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
      repo.findDistinctValuesByKey.mockResolvedValue(
        new Map([
          ['material', ['Силікон']],
          ['magsafe', ['false', 'true']],
        ]),
      );

      const result = await service.getFilterableSpecs('cat');

      expect(result.map((facet) => facet.definition.key)).toEqual(['material', 'magsafe']);
      expect(result[1].values).toEqual(['false', 'true']);
    });

    it('surfaces the colour facet once its subtree has values', async () => {
      const colorDef = { ...materialDef, id: 'd-color', key: 'color', label: 'Колір' };
      repo.findEffectiveForCategory.mockResolvedValue([colorDef, materialDef]);
      categoryRepository.findSubtreeIds.mockResolvedValue(['cat']);
      repo.findDistinctValuesByKey.mockResolvedValue(
        new Map([
          ['color', ['Білий', 'Чорний']],
          ['material', ['Силікон']],
        ]),
      );

      const result = await service.getFilterableSpecs('cat');

      expect(result.map((facet) => facet.definition.key)).toEqual(['color', 'material']);
      expect(result[0].values).toEqual(['Білий', 'Чорний']);
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
});
