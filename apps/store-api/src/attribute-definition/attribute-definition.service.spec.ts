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
