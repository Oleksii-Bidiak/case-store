import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { AttributeType } from '@prisma/client';
import { AttributeDefinitionService } from './attribute-definition.service';
import { AttributeDefinitionRepository } from './attribute-definition.repository';
import { CategoryRepository } from '../category';

describe('AttributeDefinitionService', () => {
  let service: AttributeDefinitionService;
  const repo = {
    findByCategoryId: jest.fn(),
    findById: jest.fn(),
    findByCategoryAndKey: jest.fn(),
    findEffectiveForCategory: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    reorder: jest.fn(),
  };
  const categoryRepository = { findById: jest.fn() };

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
});
